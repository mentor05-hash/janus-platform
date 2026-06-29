import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computeSessionCost } from '../../config/constants';
import { ConsultMode, ConsultType, TeacherGrade } from '../../config/enums';

export interface SessionQuote {
  mode: ConsultMode;
  minutes: number;
  perHour: number;
  surchargePct: number;
  occupancyFee: number;
  paidConsultingFee: number;
  credits: number;
}

export interface BoardQuote {
  mode: 'board';
  qType: 'item' | 'general';
  credits: number;
}

/**
 * 요금 단일 소스 (CLAUDE.md §5-2). Phase 1 은 전사 기본정책(center_id NULL) 읽기 슬라이스.
 * 정책 편집(/admin/pricing)은 Phase 2.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** 시간제 세션(zoom/chat/hand/offline) 요금. 센터 정책 우선·전사 fallback. S급은 할증율 적용. */
  async quoteSession(
    mode: ConsultMode,
    minutes: number,
    grade: TeacherGrade,
    centerId?: string | null,
    consultType?: ConsultType,
  ): Promise<SessionQuote> {
    if (minutes <= 0) throw new BadRequestException('상담 시간이 올바르지 않습니다.');
    const policy = await this.getPolicy(mode, centerId);
    const surchargePct = grade === TeacherGrade.S ? policy.surcharge_pct : 0;
    let credits = computeSessionCost(policy.per_hour, minutes, surchargePct);
    // 오프라인 점유료 가산(§5-2, O5) — 정책 미설정 시 0
    const occupancyFee = mode === ConsultMode.OFFLINE ? policy.offline_occupancy_fee ?? 0 : 0;
    // 입시 유료컨설팅 별도 단가 가산(§5-2, O33) — 정책 미설정 시 0
    const paidConsultingFee =
      consultType === ConsultType.ADMISSION ? policy.paid_consulting_fee ?? 0 : 0;
    credits += occupancyFee + paidConsultingFee;
    return { mode, minutes, perHour: policy.per_hour, surchargePct, occupancyFee, paidConsultingFee, credits };
  }

  /** 게시판 건당 요금(문항 ≥ 일반). */
  async quoteBoard(qType: 'item' | 'general', centerId?: string | null): Promise<BoardQuote> {
    const policy = await this.getPolicy('board' as ConsultMode, centerId);
    const credits = (qType === 'item' ? policy.board_item_fee : policy.board_general_fee) ?? 0;
    return { mode: 'board', qType, credits };
  }

  /** 센터 전용 정책(center_id=centerId) 우선, 없으면 전사 기본(center_id=null). */
  private async getPolicy(mode: ConsultMode, centerId?: string | null) {
    if (centerId) {
      const centerPolicy = await this.prisma.pricing_policy.findFirst({
        where: { center_id: centerId, mode: mode, enabled: true },
      });
      if (centerPolicy) return centerPolicy;
    }
    const base = await this.prisma.pricing_policy.findFirst({
      where: { center_id: null, mode: mode, enabled: true },
    });
    if (!base) throw new NotFoundException(`요금정책(${mode})이 설정되어 있지 않습니다.`);
    return base;
  }
}
