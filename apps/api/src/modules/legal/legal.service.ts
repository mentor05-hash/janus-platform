import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { ConsentDto, WithdrawDto } from './dto/legal.dto';
import {
  PRIVACY_DOC,
  PRIVACY_VERSION,
  TERMS_DOC,
  TERMS_VERSION,
} from './legal.content';

/** 법/개인정보 — 약관·방침 조회, 동의 기록(미성년 보호자 동의), 데이터 내보내기, 회원 탈퇴. */
@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  terms() {
    return TERMS_DOC;
  }
  privacy() {
    return PRIVACY_DOC;
  }

  async getConsent(user: AuthUser) {
    const c = await this.prisma.user_consent.findUnique({
      where: { account_id: user.id },
    });
    return {
      agreed: !!c,
      current: c
        ? {
            termsVersion: c.terms_version,
            privacyVersion: c.privacy_version,
            marketingAgreed: c.marketing_agreed,
            isMinor: c.is_minor,
            guardianName: c.guardian_name,
            agreedAt: c.agreed_at,
          }
        : null,
      // 최신 버전과 다르면 재동의 필요
      needsRenewal:
        !c ||
        c.terms_version !== TERMS_VERSION ||
        c.privacy_version !== PRIVACY_VERSION,
      latest: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    };
  }

  async saveConsent(user: AuthUser, dto: ConsentDto) {
    if (!dto.termsAgreed || !dto.privacyAgreed) {
      throw new BadRequestException('필수 약관·개인정보 동의가 필요합니다.');
    }
    if (
      dto.isMinor &&
      (!dto.guardianName?.trim() || !dto.guardianContact?.trim())
    ) {
      throw new BadRequestException(
        '미성년 회원은 보호자 성명·연락처 동의가 필요합니다.',
      );
    }
    const data = {
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      marketing_agreed: !!dto.marketingAgreed,
      is_minor: !!dto.isMinor,
      guardian_name: dto.isMinor ? dto.guardianName!.trim() : null,
      guardian_contact: dto.isMinor ? dto.guardianContact!.trim() : null,
      agreed_at: new Date(),
    };
    await this.prisma.user_consent.upsert({
      where: { account_id: user.id },
      create: { account_id: user.id, ...data },
      update: data,
    });
    return { ok: true, ...(await this.getConsent(user)) };
  }

  /** 내 데이터 내보내기(JSON) — 보유 개인정보를 회원이 직접 내려받기(개인정보보호법 열람·이동권). */
  async exportData(user: AuthUser) {
    const account = await this.prisma.account.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        login_id: true,
        name: true,
        role: true,
        status: true,
        created_at: true,
        center: { select: { name: true } },
      },
    });
    const consent = await this.prisma.user_consent.findUnique({
      where: { account_id: user.id },
    });
    const out: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      account,
      consent,
    };

    if (user.role === AccountRole.STUDENT) {
      out.profile = await this.prisma.student_profile.findUnique({
        where: { account_id: user.id },
      });
      out.bookings = await this.prisma.booking.findMany({
        where: { student_id: user.id },
        select: {
          id: true,
          start_at: true,
          consult_type: true,
          sub_type: true,
          mode: true,
          status: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
        take: 500,
      });
      out.credit = await this.prisma.credit_account.findFirst({
        where: { student_id: user.id },
      });
      out.qnaPosts = await this.prisma.qna_post.findMany({
        where: { student_id: user.id },
        select: {
          id: true,
          subject: true,
          body: true,
          status: true,
          created_at: true,
        },
        take: 500,
      });
      out.reviews = await this.prisma.review.findMany({
        where: { student_id: user.id },
        select: {
          id: true,
          rating_content: true,
          text: true,
          created_at: true,
        },
        take: 500,
      });
    } else if (user.role === AccountRole.TEACHER) {
      out.profile = await this.prisma.teacher_profile.findUnique({
        where: { account_id: user.id },
      });
      out.bookings = await this.prisma.booking.findMany({
        where: { teacher_id: user.id },
        select: { id: true, start_at: true, status: true, created_at: true },
        orderBy: { created_at: 'desc' },
        take: 500,
      });
      out.answers = await this.prisma.qna_answer.findMany({
        where: { teacher_id: user.id },
        select: { id: true, body: true, accepted: true, created_at: true },
        take: 500,
      });
    } else if (user.role === AccountRole.GUARDIAN) {
      out.profile = await this.prisma.guardian.findUnique({
        where: { account_id: user.id },
      });
    }
    return out;
  }

  /**
   * 회원 탈퇴 — PII 비식별 + 계정 비활성화(로그인 차단). 기록(예약·상담·정산)은
   * 통계·법령 보관 위해 유지하되 이름을 '탈퇴회원'으로 비식별한다.
   */
  async withdraw(user: AuthUser, dto: WithdrawDto) {
    const suffix = user.id.slice(0, 8);
    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: user.id },
        data: {
          name: '탈퇴회원',
          login_id: `withdrawn_${suffix}`,
          pw_hash: 'withdrawn',
          status: 'inactive',
          withdrawn_at: new Date(),
          withdrawal_reason: dto.reason ?? null,
        },
      });
      // 보호자 동의 등 민감 개인정보 제거
      await tx.user_consent.deleteMany({ where: { account_id: user.id } });
    });
    return {
      ok: true,
      message: '회원 탈퇴가 완료되었습니다. 개인정보는 비식별 처리되었습니다.',
    };
  }
}
