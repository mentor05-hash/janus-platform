import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { kstDateString } from '../../common/time/kst';
import { ConsultMode } from '../../config/enums';
import { AvailabilityService } from '../availability/availability.service';
import { BlockService } from '../report/block.service';
import { MatchAutoDto } from './dto/match.dto';
import { resolveStudentType } from '../../common/student-type';
import { DEFAULT_CONSULT_DURATION } from '../../common/consult-assignment';
import { SLOT_GRANULARITY_MINUTES } from '../../config/constants';

const ONLINE_MODES = ['zoom', 'chat', 'hand'];

const MATCH_MINUTES = 30; // 정책 미설정·미매핑 종류 폴백
const HORIZON_DAYS = 7;

/**
 * 매칭 (CLAUDE.md §3, §6). MVP: 30분 자동매칭 — 7일 내 첫 가용 자리 제안.
 * 제안만 반환(미확정). 학생이 POST /bookings 로 확정.
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly blocks: BlockService,
  ) {}

  async autoMatch(dto: MatchAutoDto, user: AuthUser, now = new Date()) {
    const student = await this.prisma.student_profile.findUnique({
      where: { account_id: user.id },
    });
    if (!student) throw new NotFoundException('학생 프로필이 없습니다.');

    // 외부학생(온라인 한정): 온라인 방식 강제 + 온라인 선생님만 매칭(정책 onlineOnly)
    let externalOnline = false;
    if (resolveStudentType(student) === 'external') {
      const row = await this.prisma.system_setting.findUnique({
        where: { key: 'external_student_policy' },
      });
      externalOnline =
        (row?.value as { onlineOnly?: boolean } | null)?.onlineOnly ?? true;
    }
    const mode: ConsultMode =
      !externalOnline && dto.mode === 'offline'
        ? ConsultMode.OFFLINE
        : ConsultMode.ZOOM;
    const blocked = await this.blocks.blockedTeacherIds(user.id); // 차단 교사 제외(§ 신고·차단)
    const teachers = await this.prisma.teacher_profile.findMany({
      where: {
        ...(student.center_id ? { center_id: student.center_id } : {}),
        ...(blocked.length ? { account_id: { notIn: blocked } } : {}),
        ...(externalOnline ? { modes: { hasSome: ONLINE_MODES } } : {}),
      },
      select: { account_id: true },
    });

    // 상담 종류별 기본 상담시간(본사 정책) → 필요한 연속 슬롯 수
    const durRow = await this.prisma.system_setting.findUnique({
      where: { key: 'consult_duration_policy' },
    });
    const durMap = {
      ...DEFAULT_CONSULT_DURATION,
      ...((durRow?.value as Record<string, number>) ?? {}),
    };
    const minutes = durMap[dto.consultType] ?? MATCH_MINUTES;
    const slotsNeeded = Math.max(
      1,
      Math.round(minutes / SLOT_GRANULARITY_MINUTES),
    );

    for (let d = 0; d < HORIZON_DAYS; d++) {
      const dateStr = kstDateString(new Date(now.getTime() + d * 86_400_000));
      for (const t of teachers) {
        const slots = await this.availability.getDaySlots(
          t.account_id,
          dateStr,
          user.id,
        );
        const start = this.firstFreeRun(
          slots.map((s) => s.status),
          slotsNeeded,
        );
        if (start !== null) {
          return {
            matched: true,
            teacherId: t.account_id,
            date: dateStr,
            slotStart: slots[start].index,
            slotEnd: slots[start].index + slotsNeeded,
            minutes,
            mode,
            consultType: dto.consultType,
            subType: dto.subType ?? null,
            status: 'new',
            note: '제안된 자리입니다. POST /bookings 로 확정하세요.',
          };
        }
      }
    }
    throw new ConflictException('7일 내 가용한 자리가 없습니다.');
  }

  /** status 배열에서 연속 avail 이 length 개 이상인 첫 시작 인덱스. */
  private firstFreeRun(statuses: string[], length: number): number | null {
    let run = 0;
    for (let i = 0; i < statuses.length; i++) {
      run = statuses[i] === 'avail' ? run + 1 : 0;
      if (run >= length) return i - length + 1;
    }
    return null;
  }
}
