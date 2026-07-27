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
import type {
  GuardianConsentDto,
  GuardianVerifyDto,
} from './dto/guardian-consent.dto';

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
      where: {
        guardian_id: guardianId,
        student_id: studentId,
        status: 'approved',
      },
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
    if (user.role !== AccountRole.GUARDIAN)
      throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    await this.assertApprovedLink(user.id, studentId);
    const row = await this.prisma.guardian_data_consent.findUnique({
      where: {
        guardian_id_student_id: { guardian_id: user.id, student_id: studentId },
      },
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
      consentAt: active ? (row?.consent_at ?? null) : null,
      revokedAt: row?.revoked_at ?? null,
      policyVersion: GuardianConsentService.POLICY_VERSION,
    };
  }

  /** POST /guardian/verify — 본인확인(어댑터). 성공 시 verify_status='verified'. 원본 PII 미저장. */
  async verify(user: AuthUser, dto: GuardianVerifyDto) {
    if (user.role !== AccountRole.GUARDIAN)
      throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    await this.assertApprovedLink(user.id, dto.studentId);

    const result = await this.identity.verify({
      name: dto.name,
      birth: dto.birth,
      phone: dto.phone,
      method: dto.method,
    });

    await this.prisma.guardian_data_consent.upsert({
      where: {
        guardian_id_student_id: {
          guardian_id: user.id,
          student_id: dto.studentId,
        },
      },
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
    if (!result.ok)
      throw new BadRequestException(
        `본인확인에 실패했습니다(${result.reason ?? 'unknown'}).`,
      );
    return {
      ok: true,
      verifyStatus: 'verified',
      verifiedName: result.name,
      provider: result.provider,
    };
  }

  /** POST /guardian/consent — 데이터 전달 동의(본인확인 완료 후에만). */
  async grantConsent(user: AuthUser, dto: GuardianConsentDto) {
    if (user.role !== AccountRole.GUARDIAN)
      throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    await this.assertApprovedLink(user.id, dto.studentId);
    const row = await this.prisma.guardian_data_consent.findUnique({
      where: {
        guardian_id_student_id: {
          guardian_id: user.id,
          student_id: dto.studentId,
        },
      },
    });
    if (!row || row.verify_status !== 'verified') {
      throw new BadRequestException(
        '본인확인을 먼저 완료해야 동의할 수 있습니다.',
      );
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
    this.logger.log(
      `전달 동의 부여 guardian=${user.id} student=${dto.studentId} v=${GuardianConsentService.POLICY_VERSION}`,
    );
    return { ok: true, consentDelivery: true };
  }

  /** DELETE /guardian/consent?studentId= — 전달 동의 철회(즉시). */
  async revokeConsent(user: AuthUser, studentId: string) {
    if (user.role !== AccountRole.GUARDIAN)
      throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    await this.assertApprovedLink(user.id, studentId);
    const row = await this.prisma.guardian_data_consent.findUnique({
      where: {
        guardian_id_student_id: { guardian_id: user.id, student_id: studentId },
      },
    });
    if (!row) throw new NotFoundException('동의 기록이 없습니다.');
    await this.prisma.guardian_data_consent.update({
      where: { id: row.id },
      data: {
        consent_delivery: false,
        revoked_at: new Date(),
        updated_at: new Date(),
      },
    });
    return { ok: true, consentDelivery: false };
  }

  // ── 학생 본인의 보호자 공유 동의(O105) — 성인 학생 데이터 열람 게이트 ──

  /** 내 보호자 목록 + 공유 동의 상태(학생). 미성년이면 보호자 권한이라 동의 토글이 무의미함을 함께 알린다. */
  async myShareConsents(user: AuthUser, scope = 'report') {
    if (user.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 사용할 수 있습니다.');
    const links = await this.prisma.guardian_student_link.findMany({
      where: { student_id: user.id, status: 'approved' },
      select: { guardian_id: true, relation: true },
    });
    const rows = await this.prisma.student_share_consent.findMany({
      where: { student_id: user.id, scope },
    });
    const byGuardian = new Map(rows.map((r) => [r.guardian_id, r]));
    const guardians = await this.prisma.account.findMany({
      where: { id: { in: links.map((l) => l.guardian_id) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(guardians.map((g) => [g.id, g.name]));
    return {
      scope,
      isMinor: await this.isMinor(user.id),
      policyVersion: GuardianConsentService.POLICY_VERSION,
      guardians: links.map((l) => {
        const r = byGuardian.get(l.guardian_id);
        return {
          guardianId: l.guardian_id,
          guardianName: nameOf.get(l.guardian_id) ?? null,
          relation: l.relation,
          granted: !!r && !r.revoked_at,
          grantedAt: r && !r.revoked_at ? r.granted_at : null,
          revokedAt: r?.revoked_at ?? null,
        };
      }),
    };
  }

  /** 공유 동의 부여(학생 본인만). 승인된 연결의 보호자에게만. */
  async grantShare(user: AuthUser, guardianId: string, scope = 'report') {
    if (user.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 동의할 수 있습니다.');
    await this.assertApprovedLink(guardianId, user.id);
    await this.prisma.student_share_consent.upsert({
      where: {
        student_id_guardian_id_scope: {
          student_id: user.id,
          guardian_id: guardianId,
          scope,
        },
      },
      create: {
        student_id: user.id,
        guardian_id: guardianId,
        scope,
        policy_version: GuardianConsentService.POLICY_VERSION,
      },
      update: {
        granted_at: new Date(),
        revoked_at: null,
        policy_version: GuardianConsentService.POLICY_VERSION,
        updated_at: new Date(),
      },
    });
    this.logger.log(
      `학생 공유 동의 student=${user.id} guardian=${guardianId} scope=${scope}`,
    );
    return { ok: true, granted: true };
  }

  /** 공유 동의 철회(즉시). 이력은 남긴다(행 삭제 안 함). */
  async revokeShare(user: AuthUser, guardianId: string, scope = 'report') {
    if (user.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 철회할 수 있습니다.');
    const row = await this.prisma.student_share_consent.findUnique({
      where: {
        student_id_guardian_id_scope: {
          student_id: user.id,
          guardian_id: guardianId,
          scope,
        },
      },
    });
    if (!row) throw new NotFoundException('동의 기록이 없습니다.');
    await this.prisma.student_share_consent.update({
      where: { id: row.id },
      data: { revoked_at: new Date(), updated_at: new Date() },
    });
    this.logger.log(
      `학생 공유 동의 철회 student=${user.id} guardian=${guardianId} scope=${scope}`,
    );
    return { ok: true, granted: false };
  }

  /**
   * **자녀 데이터 열람 게이트**(O105) — 보호자가 자녀 산출물을 읽을 수 있는지 판정. 기본은 deny.
   *   1) 보호자 역할 + 승인된 연결(pending/rejected 차단)
   *   2) 미성년 → 보호자 본인확인(verified) + 전달동의(consent_delivery, 미철회)
   *   3) 성인   → **학생 본인의 공유 동의**(student_share_consent, 미철회)
   * is_minor 기록이 없으면 성인으로 간주해 학생 동의를 요구한다(보수적 기본값).
   */
  async assertChildDataAccess(
    user: AuthUser,
    studentId: string,
    scope = 'report',
  ): Promise<void> {
    if (user.role !== AccountRole.GUARDIAN)
      throw new ForbiddenException('학부모만 조회할 수 있습니다.');
    await this.assertApprovedLink(user.id, studentId);
    if (await this.isMinor(studentId)) {
      const row = await this.prisma.guardian_data_consent.findUnique({
        where: {
          guardian_id_student_id: {
            guardian_id: user.id,
            student_id: studentId,
          },
        },
      });
      if (!row || row.verify_status !== 'verified') {
        throw new ForbiddenException({
          code: 'NEED_VERIFY',
          message: '본인확인을 먼저 완료해야 자녀 데이터를 열람할 수 있습니다.',
        });
      }
      if (!row.consent_delivery || row.revoked_at) {
        throw new ForbiddenException({
          code: 'NEED_GUARDIAN_CONSENT',
          message: '자녀 데이터 열람 동의가 필요합니다.',
        });
      }
      return;
    }
    const share = await this.prisma.student_share_consent.findUnique({
      where: {
        student_id_guardian_id_scope: {
          student_id: studentId,
          guardian_id: user.id,
          scope,
        },
      },
    });
    if (!share || share.revoked_at) {
      throw new ForbiddenException({
        code: 'NEED_STUDENT_CONSENT',
        message:
          '성인 학생 본인의 공유 동의가 필요합니다. 학생이 마이페이지에서 동의하면 열람할 수 있습니다.',
      });
    }
  }

  /**
   * **행위 게이트**(O106) — 보호자가 자녀에게 '개입'(계획 제안 등)할 수 있는지. 열람 게이트와 구분한다.
   *   · 미성년 → 승인된 연결만으로 허용(**보호자 전권**). 자녀 데이터를 읽는 행위가 아니므로
   *     본인확인·전달동의(열람용 0085 게이트)를 요구하지 않는다.
   *   · 성인   → **학생 본인의 공유 동의** 필요(학생이 보호자 개입을 승인한 경우만).
   *
   * 열람(assertChildDataAccess)과 왜 다른가: 열람은 학생의 PII·산출물을 보호자에게 내보내는 것이라
   * 미성년도 본인확인+전달동의를 요구한다. 제안은 보호자가 만든 내용을 학생에게 보내는 것이라
   * 학생 데이터가 흐르지 않는다 — 그래서 미성년은 연결만으로 충분하다.
   */
  async assertGuardianInvolvementAllowed(
    user: AuthUser,
    studentId: string,
    scope = 'report',
  ): Promise<void> {
    if (user.role !== AccountRole.GUARDIAN)
      throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    await this.assertApprovedLink(user.id, studentId);
    if (await this.isMinor(studentId)) return; // 보호자 전권
    const share = await this.prisma.student_share_consent.findUnique({
      where: {
        student_id_guardian_id_scope: {
          student_id: studentId,
          guardian_id: user.id,
          scope,
        },
      },
    });
    if (!share || share.revoked_at) {
      throw new ForbiddenException({
        code: 'NEED_STUDENT_CONSENT',
        message:
          '성인 학생 본인의 동의가 필요합니다. 학생이 동의하면 계획을 제안할 수 있습니다.',
      });
    }
  }

  /**
   * push 게이트 조회(consult-report 등에서 사용) — 해당 학생의 "본인확인+전달동의 완료" 보호자 id 목록.
   * ⚠ 이 목록이 비어있지 않아도, 직접 push 는 시스템 플래그가 ON 일 때만 수행한다(INV-10 이중 방어).
   */
  async consentedGuardianIds(studentId: string): Promise<string[]> {
    const rows = await this.prisma.guardian_data_consent.findMany({
      where: {
        student_id: studentId,
        consent_delivery: true,
        revoked_at: null,
        verify_status: 'verified',
      },
      select: { guardian_id: true },
    });
    return rows.map((r) => r.guardian_id);
  }
}
