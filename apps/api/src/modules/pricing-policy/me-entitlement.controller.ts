import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  AI_ENTITLEMENT_FEATURES,
  AiEntitlementService,
} from './ai-entitlement.service';
import { AdminPolicyService } from './admin-policy.service';
import {
  benefitOf,
  effectiveConcurrentBookings,
} from './domain/grade-benefits';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 내 등급 혜택·잔여 조회 (B221/B222). 인증 사용자 본인 것만 — 관리자 전용이 아니다.
 *
 * 왜 필요한가: 혜택을 팔았으면 **사용자가 자기 잔여를 볼 수 있어야** 한다.
 * 특히 동시 예약 상한은 등급값과 센터 한도 중 엄격한 쪽이 이기므로(B222),
 * 화면이 등급값을 그대로 보여 주면 광고와 실제가 갈라진다 —
 * 여기서 **유효값 하나**만 내보내 그 불일치를 원천 차단한다.
 */
@Controller('me')
export class MeEntitlementController {
  constructor(
    private readonly entitlement: AiEntitlementService,
    private readonly policy: AdminPolicyService,
    private readonly prisma: PrismaService,
  ) {}

  /** GET /api/v1/me/benefits — 내 등급의 유효 혜택(+ AI 리포트 잔여). */
  @Get('benefits')
  async myBenefits(@CurrentUser() user: AuthUser) {
    const [benefits, sp, reportUsage] = await Promise.all([
      this.policy.getGradeBenefits(),
      this.prisma.student_profile.findUnique({
        where: { account_id: user.id },
        select: {
          center_id: true,
          membership_grade: { select: { tier: true, name: true } },
        },
      }),
      this.entitlement.usage(user, AI_ENTITLEMENT_FEATURES.report),
    ]);

    const tier = sp?.membership_grade?.tier ?? null;
    const b = benefitOf(benefits, tier);

    // 센터 한도를 함께 보고 유효값으로 접어 내려보낸다(B222).
    const lp = sp?.center_id
      ? await this.prisma.limit_policy.findUnique({
          where: { center_id: sp.center_id },
          select: { reservation_limit: true },
        })
      : null;

    return {
      gradeTier: tier,
      gradeName: sp?.membership_grade?.name ?? null,
      qnaQueueWeight: b.qnaQueueWeight,
      placementTier: b.placementTier,
      matchHorizonDays: b.matchHorizonDays,
      /** 등급값과 센터 한도 중 엄격한 쪽. 0 = 무제한 */
      concurrentBookings: effectiveConcurrentBookings(
        b.concurrentBookings,
        lp?.reservation_limit,
      ),
      aiReport: reportUsage,
    };
  }
}
