import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  SubjectQuota,
  SubjectQuotaExceededError,
} from '../../common/quota/subject-quota';
import { subjectQuotaToHttp } from '../../common/quota/subject-quota.http';
import { AdminPolicyService } from './admin-policy.service';
import { benefitOf } from './domain/grade-benefits';

/** 권리 기능 이름 — 카운터 키에 들어간다. 늘어나면 여기에 추가한다. */
export const AI_ENTITLEMENT_FEATURES = {
  /** AI 진단·컨설팅 리포트 발급(등급 혜택 `aiReportsPerMonth`) */
  report: 'ai_report',
} as const;

export type AiEntitlementFeature =
  (typeof AI_ENTITLEMENT_FEATURES)[keyof typeof AI_ENTITLEMENT_FEATURES];

/**
 * 등급 권리(1층 entitlement) 집행 지점 (B221).
 *
 * **왜 서비스로 두는가**: 권리는 어댑터가 아니라 도메인의 관심사다.
 * 전역 비용 상한은 `LlmProvider` 경계(어댑터)에서 사용자를 몰라도 막을 수 있지만,
 * 권리는 "누가·어느 등급으로·이번 달 몇 번" 을 알아야 하고 초과 시 **상위 등급 안내**라는
 * 사업적 응답을 내야 한다. 두 관심사를 한 곳에 뭉치면 B221 이 다시 생긴다.
 *
 * **왜 지금 만드는가**: 현재 학생이 구독으로 트리거하는 LLM 기능은 **아직 없다**
 * (ocr·report 는 스태프, consulting 은 별도 결제). 즉 `aiReportsPerMonth` 는
 * 앞으로 만들 기능의 권리다. 기능이 생길 때 이 게이트를 **거치지 않고** 붙으면
 * 같은 모순이 되살아나므로, 소비 경로를 미리 하나로 만들어 둔다.
 */
@Injectable()
export class AiEntitlementService {
  private readonly subject: SubjectQuota;

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AdminPolicyService,
    @Inject(CACHE_PROVIDER) cache: CacheProvider,
  ) {
    // 권리는 fail-open — 비용은 하류 전역 상한(fail-closed)이 막는다(SubjectQuota 주석 참조).
    this.subject = new SubjectQuota(cache, 'llm');
  }

  /** 이 사용자의 등급 tier. 학생 프로필·등급이 없으면 null(= 권리 없음). */
  private async tierOf(userId: string): Promise<number | null> {
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: userId },
      select: { membership_grade: { select: { tier: true } } },
    });
    return sp?.membership_grade?.tier ?? null;
  }

  private async monthlyLimit(userId: string): Promise<number> {
    const [benefits, tier] = await Promise.all([
      this.policy.getGradeBenefits(),
      this.tierOf(userId),
    ]);
    return benefitOf(benefits, tier).aiReportsPerMonth;
  }

  /**
   * 권리 사전 검사. 한도 초과면 **402 + 업그레이드 힌트**로 던진다(503 아님).
   * 권리가 0이면(무료 등급) 곧바로 402 — "이 기능은 유료 등급 기능"이라는 뜻이다.
   *
   * **증가시키지 않는다.** 실제 차감은 작업 성공 후 `record()` — 이유는 아래 `run()` 참조.
   */
  async assertAllowed(
    user: AuthUser,
    feature: AiEntitlementFeature,
  ): Promise<void> {
    const limit = await this.monthlyLimit(user.id);
    if (limit <= 0) {
      // limit<=0 을 SubjectQuota 는 '무제한'으로 보므로 여기서 직접 거절해야 한다.
      // 무료 등급에 무제한을 주는 실수를 구조적으로 막는 분기다.
      throw subjectQuotaToHttp(
        new SubjectQuotaExceededError('entitlement', feature, 0, 'month'),
      );
    }
    try {
      await this.subject.check('entitlement', feature, user.id, limit, 'month');
    } catch (e) {
      if (e instanceof SubjectQuotaExceededError) throw subjectQuotaToHttp(e);
      throw e;
    }
  }

  /** 작업 성공 후 1건 기록. 던지지 않는다(이미 결과를 준 뒤다). */
  async record(user: AuthUser, feature: AiEntitlementFeature): Promise<void> {
    await this.subject.record(feature, user.id, 'month');
  }

  /**
   * 권리 기능 실행의 **표준 경로**. 새 유료 AI 기능은 이걸 쓴다.
   *
   *   검사 → 작업 → (성공 시에만) 기록
   *
   * 왜 이 순서인가: 선차감하면 LLM 오류·타임아웃으로 실패했을 때
   * **사용자가 돈 낸 몫을 잃는다**. 월 6건 중 1건이 서버 사정으로 날아가는 것은
   * 환불 대상이지 정상 동작이 아니다. 그래서 성공한 작업만 센다.
   *
   * 대가는 동시 요청 오버슈트(검사만 통과한 요청이 여럿 진행될 수 있다)인데,
   * 손실이 유한하고 비용은 하류 전역 상한이 여전히 막으므로 잃은 권리보다 낫다.
   */
  async run<T>(
    user: AuthUser,
    feature: AiEntitlementFeature,
    work: () => Promise<T>,
  ): Promise<T> {
    await this.assertAllowed(user, feature);
    const result = await work(); // 실패하면 여기서 던진다 — 기록하지 않는다
    await this.record(user, feature);
    return result;
  }

  /** 잔여 조회 — 화면에 "이번 달 3/6 사용"을 띄우는 용도. 증가시키지 않는다. */
  async usage(user: AuthUser, feature: AiEntitlementFeature) {
    const limit = await this.monthlyLimit(user.id);
    const u = await this.subject.usage(feature, user.id, limit, 'month');
    return {
      feature,
      period: 'month' as const,
      ...u,
      // 무료 등급은 remaining 0 이 아니라 "권리 없음"으로 구분해서 보여야 한다.
      entitled: limit > 0,
    };
  }
}
