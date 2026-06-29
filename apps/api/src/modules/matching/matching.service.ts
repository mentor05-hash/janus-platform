import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { kstDateString } from '../../common/time/kst';
import { ConsultMode } from '../../config/enums';
import { AvailabilityService } from '../availability/availability.service';
import { MatchAutoDto } from './dto/match.dto';

const MATCH_MINUTES = 30;
const SLOTS_NEEDED = MATCH_MINUTES / 10; // 3
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
  ) {}

  async autoMatch(dto: MatchAutoDto, user: AuthUser, now = new Date()) {
    const student = await this.prisma.student_profile.findUnique({ where: { account_id: user.id } });
    if (!student) throw new NotFoundException('학생 프로필이 없습니다.');

    const mode: ConsultMode = dto.mode === 'offline' ? ConsultMode.OFFLINE : ConsultMode.ZOOM;
    const teachers = await this.prisma.teacher_profile.findMany({
      where: student.center_id ? { center_id: student.center_id } : {},
      select: { account_id: true },
    });

    for (let d = 0; d < HORIZON_DAYS; d++) {
      const dateStr = kstDateString(new Date(now.getTime() + d * 86_400_000));
      for (const t of teachers) {
        const slots = await this.availability.getDaySlots(t.account_id, dateStr, user.id);
        const start = this.firstFreeRun(slots.map((s) => s.status), SLOTS_NEEDED);
        if (start !== null) {
          return {
            matched: true,
            teacherId: t.account_id,
            date: dateStr,
            slotStart: slots[start].index,
            slotEnd: slots[start].index + SLOTS_NEEDED,
            minutes: MATCH_MINUTES,
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
