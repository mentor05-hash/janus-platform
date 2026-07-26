import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { CreditService } from '../billing/credit.service';
import { NotifyService } from '../notification/notify.service';
import {
  canLinkTransition,
  evaluateRelink,
  GuardianLinkStatus,
  RELINK_COOLDOWN_DAYS,
  RELINK_MAX_ATTEMPTS,
  RELINKABLE_STATUSES,
} from './domain/guardian-link';
import {
  GuardianLinkRequestDto,
  GuardianLinkRespondDto,
} from './dto/guardian.dto';

/** 이력에 남길 전이 한 건(guardian_link_event). */
type LinkEvent = {
  linkId: string;
  from: GuardianLinkStatus | null;
  to: GuardianLinkStatus;
  actor: AuthUser;
  reason: string;
};

/** 날짜를 KST 로 표시(CLAUDE.md §7 — UTC 저장·KST 표시). */
function kstDate(d: Date): string {
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

/**
 * 보호자-학생 연결 (CLAUDE.md §3 people, 통합스펙 §학부모).
 * 신청(pending) → 학생/관리자 승인(approved)·거절(rejected), 승인 후 해제(revoked).
 * 거절·해제는 영구 잠금이 아니다 — 보호자 재신청(pending 부활, 학생 재승인 필수)과
 * 관리자 강제 복구 두 경로가 있고, 모든 전이는 guardian_link_event 에 남는다(O124).
 */
@Injectable()
export class GuardianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly credit: CreditService,
  ) {}

  /** 승인된 연결 자녀인지 확인(무단 열람·충전 방지). */
  private async assertLinked(guardianId: string, studentId: string) {
    const link = await this.prisma.guardian_student_link.findFirst({
      where: { guardian_id: guardianId, student_id: studentId, status: 'approved' },
    });
    if (!link) throw new ForbiddenException('연결된 자녀가 아닙니다.');
  }

  /** 상태 전이 1건을 이력에 기록(append-only). tx 안에서 호출한다. */
  private recordEvent(tx: Prisma.TransactionClient, e: LinkEvent) {
    return tx.guardian_link_event.create({
      data: {
        link_id: e.linkId,
        from_status: e.from,
        to_status: e.to,
        actor_id: e.actor.id,
        actor_role: e.actor.role,
        reason: e.reason,
      },
    });
  }

  /**
   * 재신청 스팸 판정 근거를 이력에서 집계.
   * 이력이 없는 기존 행(마이그레이션 0105 이전 생성)은 attempts=0·쿨다운 없음으로
   * 취급된다 — 배포 직후 첫 재신청은 즉시 허용되고, 그 뒤부터 제한이 걸린다.
   */
  private async relinkHistory(linkId: string) {
    const [lastEnded, attempts] = await Promise.all([
      this.prisma.guardian_link_event.findFirst({
        where: { link_id: linkId, to_status: { in: RELINKABLE_STATUSES } },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      }),
      this.prisma.guardian_link_event.count({
        where: {
          link_id: linkId,
          to_status: 'pending',
          from_status: { in: RELINKABLE_STATUSES },
        },
      }),
    ]);
    return { lastEndedAt: lastEnded?.created_at ?? null, attempts };
  }

  /** 보호자가 자녀 연결 신청(학생 로그인ID 기준). 거절·해제된 연결은 재신청으로 부활. */
  async requestLink(guardian: AuthUser, dto: GuardianLinkRequestDto) {
    const studentAccount = await this.prisma.account.findUnique({
      where: { login_id: dto.studentLoginId },
    });
    if (!studentAccount || studentAccount.role !== AccountRole.STUDENT) {
      throw new NotFoundException('학생을 찾을 수 없습니다.');
    }
    // guardian 행 보장(가입 시 미생성일 수 있음)
    await this.prisma.guardian.upsert({
      where: { account_id: guardian.id },
      update: {},
      create: { account_id: guardian.id },
    });

    const existing = await this.prisma.guardian_student_link.findFirst({
      where: { guardian_id: guardian.id, student_id: studentAccount.id },
    });

    // 진행 중(pending)이거나 이미 연결된(approved) 건은 재신청 대상이 아니다.
    if (existing && !RELINKABLE_STATUSES.includes(existing.status as GuardianLinkStatus)) {
      throw new BadRequestException(
        `이미 연결 신청이 존재합니다(status=${existing.status}).`,
      );
    }

    // 거절·해제된 연결 → 기존 행을 pending 으로 되살린다(@@unique 때문에 create 불가).
    if (existing) {
      const from = existing.status as GuardianLinkStatus;
      const { lastEndedAt, attempts } = await this.relinkHistory(existing.id);
      const decision = evaluateRelink(lastEndedAt, attempts, new Date());
      if (!decision.allowed) {
        throw new BadRequestException(
          decision.code === 'cooldown'
            ? `연결이 종료된 뒤 ${RELINK_COOLDOWN_DAYS}일 동안은 재신청할 수 없습니다. ${kstDate(decision.availableAt)} 이후에 다시 시도해 주세요.`
            : `재신청 횟수(${RELINK_MAX_ATTEMPTS}회)를 모두 사용했습니다. 센터 관리자에게 문의해 주세요.`,
        );
      }
      const revived = await this.prisma.$transaction(async (tx) => {
        // 상태를 조건에 걸어 갱신 — 동시 재신청이 이력을 두 번 쌓지 않도록.
        const { count } = await tx.guardian_student_link.updateMany({
          where: { id: existing.id, status: { in: RELINKABLE_STATUSES } },
          data: {
            status: 'pending',
            relation: dto.relation ?? existing.relation,
            link_method: '재신청',
          },
        });
        if (count !== 1) {
          throw new BadRequestException('연결 상태가 변경되었습니다. 다시 시도해 주세요.');
        }
        await this.recordEvent(tx, {
          linkId: existing.id,
          from,
          to: 'pending',
          actor: guardian,
          reason: 'relink',
        });
        return tx.guardian_student_link.findUniqueOrThrow({
          where: { id: existing.id },
          select: { id: true, student_id: true, status: true },
        });
      });
      // 부활도 새 신청과 같이 학생 승인이 필요하다 → 승인 요청 알림 재발송.
      await this.notify.notify(studentAccount.id, 'guardian_link_requested', {
        linkId: revived.id,
        guardianId: guardian.id,
      });
      return revived;
    }

    const link = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guardian_student_link.create({
        data: {
          guardian_id: guardian.id,
          student_id: studentAccount.id,
          relation: dto.relation ?? null,
          status: 'pending',
          link_method: '신청',
        },
        select: { id: true, student_id: true, status: true },
      });
      await this.recordEvent(tx, {
        linkId: created.id,
        from: null,
        to: 'pending',
        actor: guardian,
        reason: 'request',
      });
      return created;
    });
    // 보호자 연결 신청 → 학생에게 승인 요청 알림
    await this.notify.notify(studentAccount.id, 'guardian_link_requested', {
      linkId: link.id,
      guardianId: guardian.id,
    });
    return link;
  }

  /**
   * 연결 목록 — **양쪽 모두 자기 관점으로 본다**.
   * 이전에는 조회 API 가 아예 없어 학생은 보호자 신청이 온 줄 몰랐고(승인 UI 부재),
   * 보호자는 자기 신청이 어떤 상태인지 볼 수 없었다 → 연결이 성립하지 못해 학부모 메뉴 전량이 빈 화면이었다.
   * 상대 이름만 노출한다(연락처·아이디 등 PII 는 싣지 않는다).
   */
  async listLinks(user: AuthUser) {
    const isGuardian = user.role === AccountRole.GUARDIAN;
    const rows = await this.prisma.guardian_student_link.findMany({
      where: isGuardian ? { guardian_id: user.id } : { student_id: user.id },
      select: {
        id: true, status: true, relation: true,
        guardian: { select: { account: { select: { name: true } } } },
        student_profile: { select: { account: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      relation: r.relation,
      /** 상대의 이름 — 보호자가 보면 자녀, 학생이 보면 보호자. */
      counterpartName: (isGuardian ? r.student_profile?.account?.name : r.guardian?.account?.name) ?? '이름 없음',
      /** 학생만 응답할 수 있다(pending 일 때). 화면이 버튼 노출을 판단하는 근거. */
      canRespond: !isGuardian && r.status === 'pending',
    }));
  }

  /** 보호자의 승인된 자녀 목록(대시보드). */
  async listChildren(guardian: AuthUser) {
    const links = await this.prisma.guardian_student_link.findMany({
      where: { guardian_id: guardian.id, status: 'approved' },
      select: { id: true, student_id: true, relation: true },
    });
    const children = await Promise.all(
      links.map(async (l) => {
        const [acc, sp, ca, weeklyGrant, nextBooking] = await Promise.all([
          this.prisma.account.findUnique({
            where: { id: l.student_id },
            select: { name: true },
          }),
          this.prisma.student_profile.findUnique({
            where: { account_id: l.student_id },
            select: {
              homeroom_teacher_id: true,
              school_grade: true,
              center: { select: { name: true } },
              membership_grade: { select: { name: true, weekly_credits: true } },
            },
          }),
          this.prisma.credit_account.findUnique({
            where: { student_id: l.student_id },
            select: { purchased_balance: true, granted_balance: true },
          }),
          undefined,
          this.prisma.booking.findFirst({
            where: {
              student_id: l.student_id,
              status: { in: ['new', 'confirmed', 'done'] },
            },
            orderBy: { start_at: 'desc' },
            select: { status: true, start_at: true, consult_type: true },
          }),
        ]);
        return {
          linkId: l.id,
          studentId: l.student_id,
          name: acc?.name ?? null,
          relation: l.relation,
          centerName: sp?.center?.name ?? null,
          schoolGrade: sp?.school_grade ?? null,
          isHomeroom: !!sp?.homeroom_teacher_id,
          membershipGrade: sp?.membership_grade?.name ?? null,
          weeklyCredits: sp?.membership_grade?.weekly_credits ?? 0,
          balance: (ca?.purchased_balance ?? 0) + (ca?.granted_balance ?? 0),
          lastStatus: nextBooking?.status ?? null,
          lastAt: nextBooking?.start_at ?? null,
        };
      }),
    );
    return children;
  }

  /** 자녀 크레딧 계좌 + 거래 내역(보호자, 연결 자녀만). */
  async childCredits(guardian: AuthUser, studentId: string) {
    await this.assertLinked(guardian.id, studentId);
    const [ca, txs] = await Promise.all([
      this.prisma.credit_account.findUnique({
        where: { student_id: studentId },
      }),
      this.prisma.credit_transaction.findMany({
        where: { credit_account: { student_id: studentId } },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
    ]);
    return {
      account: ca
        ? {
            purchasedBalance: ca.purchased_balance,
            grantedBalance: ca.granted_balance,
            total: ca.purchased_balance + ca.granted_balance,
          }
        : { purchasedBalance: 0, grantedBalance: 0, total: 0 },
      transactions: txs,
    };
  }

  /** 자녀 크레딧 충전(보호자 대납). 연결 자녀 한정. */
  async chargeChild(
    guardian: AuthUser,
    studentId: string,
    amount: number,
    method?: string,
  ) {
    await this.assertLinked(guardian.id, studentId);
    const result = await this.credit.charge(studentId, amount, method);
    return { studentId, amount, ...result };
  }

  /** 학생 본인 또는 관리자/HR 이 연결 신청에 승인·거절·해제. */
  async respondLink(
    linkId: string,
    dto: GuardianLinkRespondDto,
    actor: AuthUser,
  ) {
    const link = await this.prisma.guardian_student_link.findUnique({
      where: { id: linkId },
    });
    if (!link) throw new NotFoundException('연결 신청을 찾을 수 없습니다.');

    const isStudentOwner =
      actor.role === AccountRole.STUDENT && actor.id === link.student_id;
    const isAdmin =
      actor.role === AccountRole.ADMIN || actor.role === AccountRole.HR;
    if (!isStudentOwner && !isAdmin) {
      throw new ForbiddenException('연결을 승인/거절할 권한이 없습니다.');
    }

    const to: GuardianLinkStatus =
      dto.action === 'approve'
        ? 'approved'
        : dto.action === 'reject'
          ? 'rejected'
          : 'revoked';
    const from = link.status as GuardianLinkStatus;
    if (!canLinkTransition(from, to, { isAdmin })) {
      throw new BadRequestException(
        `허용되지 않는 연결 상태 전이: ${link.status} → ${to}`,
      );
    }
    // 종착 상태(rejected·revoked)를 되돌리는 건 관리자만 가능한 강제 복구 — 이력에 구분해 남긴다.
    const reason =
      isAdmin && RELINKABLE_STATUSES.includes(from) ? 'admin_override' : 'respond';
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.guardian_student_link.update({
        where: { id: linkId },
        data: { status: to },
        select: { id: true, status: true },
      });
      await this.recordEvent(tx, { linkId, from, to, actor, reason });
      return row;
    });
    // 연결 신청 응답 → 신청한 보호자에게 알림(승인/거절/해제)
    await this.notify.notify(link.guardian_id, 'guardian_link_responded', {
      linkId,
      status: to,
      studentId: link.student_id,
    });
    return updated;
  }
}
