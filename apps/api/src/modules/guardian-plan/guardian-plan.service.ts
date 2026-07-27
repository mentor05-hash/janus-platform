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
import { GuardianConsentService } from '../guardian-consent/guardian-consent.service';
import { NotifyService } from '../notification/notify.service';

export type PlanInput = {
  title: string;
  subject?: string | null;
  dueDate?: string | null;
  note?: string | null;
};

const dateOnly = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

/**
 * 학부모 계획 트랙(O106) — 학부모가 자기 공간에서 자녀 계획을 세우고, '제안'하면 학생이 수락/거절한다.
 *
 * 두 축 분리(D1 연장): 학생 인박스(student_task) ↔ 학부모 트랙(guardian_plan_item).
 * 제안은 **수락 시에만** student_task 가 된다 — ⑤-2 자동 재동기화(auto·gap)·dismissed 톰스톤과 얽히지 않도록.
 * 연령 권한(O105): 미성년=제안 자유 / 성인=학생 본인의 공유 동의 필요. 자기 트랙 관리 자체는 승인된 연결만 필요.
 */
@Injectable()
export class GuardianPlanService {
  private readonly logger = new Logger(GuardianPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: GuardianConsentService,
    private readonly notify: NotifyService,
  ) {}

  /** 승인된 연결만(pending/rejected 차단). 학부모 자기 트랙의 최소 요건. */
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

  private assertGuardian(user: AuthUser) {
    if (user.role !== AccountRole.GUARDIAN)
      throw new ForbiddenException('학부모만 사용할 수 있습니다.');
  }

  /** 내 계획 트랙 목록(학부모). 자녀별. */
  async list(user: AuthUser, studentId: string) {
    this.assertGuardian(user);
    await this.assertApprovedLink(user.id, studentId);
    return this.prisma.guardian_plan_item.findMany({
      where: { guardian_id: user.id, student_id: studentId },
      orderBy: [{ status: 'asc' }, { due_date: 'asc' }, { created_at: 'desc' }],
    });
  }

  /** 계획 항목 추가(학부모 자기 트랙 — 아직 학생에게 보이지 않는 draft). */
  async create(user: AuthUser, studentId: string, dto: PlanInput) {
    this.assertGuardian(user);
    await this.assertApprovedLink(user.id, studentId);
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('계획 제목을 입력하세요.');
    return this.prisma.guardian_plan_item.create({
      data: {
        guardian_id: user.id,
        student_id: studentId,
        title,
        subject: dto.subject?.trim() || null,
        due_date: dto.dueDate ? dateOnly(dto.dueDate) : null,
        note: dto.note?.trim() || null,
      },
    });
  }

  private async owned(user: AuthUser, id: string) {
    const row = await this.prisma.guardian_plan_item.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('계획을 찾을 수 없습니다.');
    if (row.guardian_id !== user.id)
      throw new ForbiddenException('본인이 만든 계획만 변경할 수 있습니다.');
    return row;
  }

  /** 계획 수정(학부모). 이미 제안·응답된 항목의 내용은 바꾸지 않는다(학생이 본 내용과 달라지지 않게). */
  async update(user: AuthUser, id: string, dto: PlanInput) {
    this.assertGuardian(user);
    const row = await this.owned(user, id);
    if (row.status !== 'draft')
      throw new BadRequestException(
        '이미 제안한 계획은 수정할 수 없습니다. 새로 만들어 주세요.',
      );
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('계획 제목을 입력하세요.');
    return this.prisma.guardian_plan_item.update({
      where: { id },
      data: {
        title,
        subject: dto.subject?.trim() || null,
        due_date: dto.dueDate ? dateOnly(dto.dueDate) : null,
        note: dto.note?.trim() || null,
        updated_at: new Date(),
      },
    });
  }

  /** 계획 삭제(학부모 자기 트랙). 학생이 수락해 만들어진 할 일은 학생 것이라 지우지 않는다. */
  async remove(user: AuthUser, id: string) {
    this.assertGuardian(user);
    await this.owned(user, id);
    await this.prisma.guardian_plan_item.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * 학생에게 제안(O105 연령 게이트).
   * 미성년 → 보호자 권한으로 자유. 성인 → 학생 본인의 공유 동의가 있어야 한다.
   */
  async propose(user: AuthUser, id: string) {
    this.assertGuardian(user);
    const row = await this.owned(user, id);
    if (row.status !== 'draft')
      throw new BadRequestException('이미 제안한 계획입니다.');
    // **행위 게이트**(열람 게이트와 다름): 미성년=연결만으로 전권 / 성인=학생 본인 동의 필요.
    // 제안은 학부모가 만든 내용을 학생에게 보내는 것이라 학생 데이터가 흐르지 않는다 → 미성년에 본인확인 불요.
    await this.consent.assertGuardianInvolvementAllowed(user, row.student_id);
    const updated = await this.prisma.guardian_plan_item.update({
      where: { id },
      data: {
        status: 'proposed',
        proposed_at: new Date(),
        updated_at: new Date(),
      },
    });
    await this.notify.notify(row.student_id, 'guardian_plan_proposed', {
      planId: row.id,
      title: row.title,
    });
    this.logger.log(
      `학부모 계획 제안 guardian=${user.id} student=${row.student_id} plan=${row.id}`,
    );
    return updated;
  }

  // ── 학생 측: 대기 중인 제안 조회·수락·거절 ──

  private assertStudent(user: AuthUser) {
    if (user.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 사용할 수 있습니다.');
  }

  /** 나에게 온 학부모 제안(대기 중). 수락 전에는 할 일 목록에 나타나지 않는다. */
  async myProposals(user: AuthUser) {
    this.assertStudent(user);
    const rows = await this.prisma.guardian_plan_item.findMany({
      where: { student_id: user.id, status: 'proposed' },
      orderBy: { proposed_at: 'desc' },
    });
    const guardians = await this.prisma.account.findMany({
      where: { id: { in: rows.map((r) => r.guardian_id) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(guardians.map((g) => [g.id, g.name]));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      subject: r.subject,
      dueDate: r.due_date,
      note: r.note,
      proposedAt: r.proposed_at,
      guardianName: nameOf.get(r.guardian_id) ?? null,
    }));
  }

  private async proposedToMe(user: AuthUser, id: string) {
    const row = await this.prisma.guardian_plan_item.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('제안을 찾을 수 없습니다.');
    if (row.student_id !== user.id)
      throw new ForbiddenException('내게 온 제안이 아닙니다.');
    if (row.status !== 'proposed')
      throw new BadRequestException('이미 응답한 제안입니다.');
    return row;
  }

  /**
   * 상태를 **원자적으로 선점**한다(이중 탭·동시 요청 방어).
   * 읽고-쓰기 사이에 다른 요청이 끼면 할 일이 중복 생성되므로, updateMany 조건부 갱신으로 한 명만 이기게 한다
   * (tasks.service 의 리마인더 claim 과 같은 패턴). 이긴 쪽만 count===1 을 받는다.
   */
  private async claimProposal(
    user: AuthUser,
    id: string,
    next: 'accepted' | 'declined',
  ) {
    const row = await this.proposedToMe(user, id); // 존재·소유·상태 사전 검증(친절한 오류 메시지용)
    const claim = await this.prisma.guardian_plan_item.updateMany({
      where: { id, student_id: user.id, status: 'proposed' },
      data: { status: next, responded_at: new Date(), updated_at: new Date() },
    });
    if (claim.count !== 1)
      throw new BadRequestException('이미 응답한 제안입니다.');
    return row;
  }

  /** 제안 수락 → 내 할 일로 만든다(created_by='guardian' 로 출처 표시). */
  async accept(user: AuthUser, id: string) {
    this.assertStudent(user);
    const row = await this.claimProposal(user, id, 'accepted'); // 선점 성공한 요청만 진행
    const task = await this.prisma.student_task.create({
      data: {
        student_id: user.id,
        title: row.title,
        category: 'custom',
        subject: row.subject,
        due_date: row.due_date,
        created_by: 'guardian', // 자동 제안(auto)·본인 추가(self)와 구분 — 출처를 화면에 표시
      },
    });
    await this.prisma.guardian_plan_item.update({
      where: { id },
      data: { student_task_id: task.id },
    });
    await this.notify.notify(row.guardian_id, 'guardian_plan_accepted', {
      planId: row.id,
      title: row.title,
    });
    return { id, accepted: true, taskId: task.id };
  }

  /** 제안 거절 — 할 일을 만들지 않는다. 학부모 트랙에는 declined 로 남아 결과가 보인다. */
  async decline(user: AuthUser, id: string) {
    this.assertStudent(user);
    const row = await this.claimProposal(user, id, 'declined');
    await this.notify.notify(row.guardian_id, 'guardian_plan_declined', {
      planId: row.id,
      title: row.title,
    });
    return { id, declined: true };
  }
}
