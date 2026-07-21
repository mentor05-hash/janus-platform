import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { IdentityVerifyProvider } from './identity-verify.provider';
import type { GuardianConsentDto, GuardianVerifyDto } from './dto/guardian-consent.dto';

/**
 * 본부 결정 ① 학부모 동의·본인확인 — 미성년 자녀 데이터 전달 게이트.
 * 흐름: 승인된 연결 → 본인확인(어댑터 stub) → 전달 동의(verified 후에만) → (직접 push 는 별도 시스템 플래그).
 * consult-report.maybePushGuardian 이 이 동의를 최종 게이트로 참조한다(플래그 OFF 이면 여전히 no-op).
 */
@Injectable()
export class GuardianConsentService {
  private readonly logger = new Logger(GuardianConsentService.name);
  static readonly POLICY_VERSION = 'v1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityVerifyProvider,
  ) {}

  /** 승인된 보호자-자녀 연결만 인정(pending/rejected 차단). */
  private async assertApprovedLink(guardianId: string, studentId: string) {
    const link = await this.prisma.guardian_student_link.findFirst({
      where: { guardian_id: guardianId, student_id: studentId, status: 'approved' },
    });
    if (!link) throw new ForbiddenException('승인된 자녀 연결이 아닙니다.');
  }

  private async isMinor(studentId: string): Promise<boolean> {
    const uc = await this.prisma.user_consent.findUnique({
      where: { account_id: studentId },
      select: { is_minor: true },
    });
    return uc?.is_minor ?? false;
  }

  /** GET /guardian/consent?studentId= — 현재 본인확인·전달동의 상태. */
  async status(user: AuthUser, studentId: string) {
    if (user.role !== AccountRole.GUARDIAN) throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    await this.assertApprovedLink(user.id, studentId);
    const row = await this.prisma.guardian_data_consent.findUnique({
      where: { guardian_id_student_id: { guardian_id: user.id, student_id: studentId } },
    });
    const active = !!row?.consent_delivery && !row?.revoked_at;
    return {
      studentId,
      isMinor: await this.isMinor(studentId),
      verifyStatus: row?.verify_status ?? 'unverified',
      verifiedName: row?.verified_name ?? null,
      verifiedAt: row?.verified_at ?? null,
      verifyProvider: row?.verify_provider ?? null,
      consentDelivery: active,
      consentAt: active ? row?.consent_at ?? null : null,
      revokedAt: row?.revoked_at ?? null,
      policyVersion: GuardianConsentService.POLICY_VERSION,
    };
  }

  /** POST /guardian/verify — 본인확인(어댑터). 성공 시 verify_status='verified'. 원본 PII 미저장. */
  async verify(user: AuthUser, dto: GuardianVerifyDto) {
    if (user.role !== AccountRole.GUARDIAN) throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    await this.assertApprovedLink(user.id, dto.studentId);

    const result = await this.identity.verify({
      name: dto.name,
      birth: dto.birth,
      phone: dto.phone,
      method: dto.method,
    });

    await this.prisma.guardian_data_consent.upsert({
      where: { guardian_id_student_id: { guardian_id: user.id, student_id: dto.studentId } },
      create: {
        guardian_id: user.id,
        student_id: dto.studentId,
        verify_status: result.ok ? 'verified' : 'failed',
        verify_method: dto.method,
        verified_name: result.ok ? result.name : null,
        verify_ref: result.ok ? result.refMasked : null,
        verify_provider: result.provider,
        verified_at: result.ok ? new Date() : null,
      },
      update: {
        verify_status: result.ok ? 'verified' : 'failed',
        verify_method: dto.method,
        verified_name: result.ok ? result.name : null,
        verify_ref: result.ok ? result.refMasked : null,
        verify_provider: result.provider,
        verified_at: result.ok ? new Date() : null,
        updated_at: new Date(),
      },
    });
    if (!result.ok) throw new BadRequestException(`본인확인에 실패했습니다(${result.reason ?? 'unknown'}).`);
    return { ok: true, verifyStatus: 'verified', verifiedName: result.name, provider: result.provider };
  }

  /** POST /guardian/consent — 데이터 전달 동의(본인확인 완료 후에만). */
  async grantConsent(user: AuthUser, dto: GuardianConsentDto) {
    if (user.role !== AccountRole.GUARDIAN) throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    await this.assertApprovedLink(user.id, dto.studentId);
    const row = await this.prisma.guardian_data_consent.findUnique({
      where: { guardian_id_student_id: { guardian_id: user.id, student_id: dto.studentId } },
    });
    if (!row || row.verify_status !== 'verified') {
      throw new BadRequestException('본인확인을 먼저 완료해야 동의할 수 있습니다.');
    }
    await this.prisma.guardian_data_consent.update({
      where: { id: row.id },
      data: {
        consent_delivery: true,
        consent_policy_version: GuardianConsentService.POLICY_VERSION,
        consent_at: new Date(),
        revoked_at: null,
        updated_at: new Date(),
      },
    });
    this.logger.log(`전달 동의 부여 guardian=${user.id} student=${dto.studentId} v=${GuardianConsentService.POLICY_VERSION}`);
    return { ok: true, consentDelivery: true };
  }

  /** DELETE /guardian/consent?studentId= — 전달 동의 철회(즉시). */
  async revokeConsent(user: AuthUser, studentId: string) {
    if (user.role !== AccountRole.GUARDIAN) throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    await this.assertApprovedLink(user.id, studentId);
    const row = await this.prisma.guardian_data_consent.findUnique({
      where: { guardian_id_student_id: { guardian_id: user.id, student_id: studentId } },
    });
    if (!row) throw new NotFoundException('동의 기록이 없습니다.');
    await this.prisma.guardian_data_consent.update({
      where: { id: row.id },
      data: { consent_delivery: false, revoked_at: new Date(), updated_at: new Date() },
    });
    return { ok: true, consentDelivery: false };
  }

  /**
   * push 게이트 조회(consult-report 등에서 사용) — 해당 학생의 "본인확인+전달동의 완료" 보호자 id 목록.
   * ⚠ 이 목록이 비어있지 않아도, 직접 push 는 시스템 플래그가 ON 일 때만 수행한다(INV-10 이중 방어).
   */
  async consentedGuardianIds(studentId: string): Promise<string[]> {
    const rows = await this.prisma.guardian_data_consent.findMany({
      where: { student_id: studentId, consent_delivery: true, revoked_at: null, verify_status: 'verified' },
      select: { guardian_id: true },
    });
    return rows.map((r) => r.guardian_id);
  }
}
