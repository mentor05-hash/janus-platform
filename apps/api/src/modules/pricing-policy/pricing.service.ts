import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computeSessionCost } from '../../config/constants';
import { ConsultMode, TeacherGrade } from '../../config/enums';

export interface SessionQuote {
  mode: ConsultMode;
  minutes: number;
  perHour: number;
  surchargePct: number;
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

  /** 시간제 세션(zoom/chat/hand/offline) 요금. S급은 정책 할증율 적용. */
  async quoteSession(mode: ConsultMode, minutes: number, grade: TeacherGrade): Promise<SessionQuote> {
    if (minutes <= 0) throw new BadRequestException('상담 시간이 올바르지 않습니다.');
    const policy = await this.getPolicy(mode);
    const surchargePct = grade === TeacherGrade.S ? policy.surcharge_pct : 0;
    const credits = computeSessionCost(policy.per_hour, minutes, surchargePct);
    return { mode, minutes, perHour: policy.per_hour, surchargePct, credits };
  }

  /** 게시판 건당 요금(문항 ≥ 일반). */
  async quoteBoard(qType: 'item' | 'general'): Promise<BoardQuote> {
    const policy = await this.getPolicy('board' as ConsultMode);
    const credits = (qType === 'item' ? policy.board_item_fee : policy.board_general_fee) ?? 0;
    return { mode: 'board', qType, credits };
  }

  private async getPolicy(mode: ConsultMode) {
    const policy = await this.prisma.pricing_policy.findFirst({
      where: { center_id: null, mode: mode as never, enabled: true },
    });
    if (!policy) throw new NotFoundException(`요금정책(${mode})이 설정되어 있지 않습니다.`);
    return policy;
  }
}
