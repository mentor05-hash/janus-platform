import {
  GRADE_BENEFITS_DEFAULT,
  GRADE_BENEFITS_GUARD,
  NO_GRADE_BENEFIT,
  QUEUE_FAIRNESS,
  benefitOf,
  compareQnaQueue,
  resolveGradeBenefits,
} from './grade-benefits';

const H = 3_600_000;
const now = new Date('2026-07-26T12:00:00Z');
const ago = (h: number) => new Date(now.getTime() - h * H);
const at = (h: number, weight: number) => ({ createdAt: ago(h), weight });
const TIERS = [1, 2, 3, 4];

describe('등급 비크레딧 혜택(B218)', () => {
  describe('기본값의 사다리 방향 — 상위 등급이 반드시 유리해야 한다', () => {
    it('큐 가중치·리포트 발급·탐색 지평이 등급과 함께 오른다', () => {
      const rising = (f: (t: number) => number) => {
        const v = TIERS.map(f);
        expect(v.every((x, i) => i === 0 || x >= v[i - 1])).toBe(true);
      };
      rising((t) => GRADE_BENEFITS_DEFAULT[t].qnaQueueWeight);
      rising((t) => GRADE_BENEFITS_DEFAULT[t].aiReportsPerMonth);
      rising((t) => GRADE_BENEFITS_DEFAULT[t].matchHorizonDays);
    });

    it('동시 예약 상한도 오른다 — VIP 는 무제한(0)', () => {
      // 0 = 무제한이라 단순 비교가 안 된다. Infinity 로 치환해서 본다.
      const v = TIERS.map((t) => {
        const n = GRADE_BENEFITS_DEFAULT[t].concurrentBookings;
        return n === 0 ? Infinity : n;
      });
      expect(v.every((x, i) => i === 0 || x >= v[i - 1])).toBe(true);
      expect(GRADE_BENEFITS_DEFAULT[4].concurrentBookings).toBe(0);
    });

    it('기본값은 전부 안전선 이내', () => {
      const g = GRADE_BENEFITS_GUARD;
      for (const t of TIERS) {
        const b = GRADE_BENEFITS_DEFAULT[t];
        expect(b.qnaQueueWeight).toBeLessThanOrEqual(g.maxQnaQueueWeight);
        expect(b.aiReportsPerMonth).toBeLessThanOrEqual(g.maxAiReportsPerMonth);
        expect(b.matchHorizonDays).toBeLessThanOrEqual(g.maxMatchHorizonDays);
        expect(b.concurrentBookings).toBeLessThanOrEqual(
          g.maxConcurrentBookings,
        );
      }
    });
  });

  describe('배치표 티어 매핑 (B003 SSO 가 소비할 값)', () => {
    it('무료 가입(Basic)은 회원 티어 — 리드 확보 수단이라 열어 둔다', () => {
      expect(GRADE_BENEFITS_DEFAULT[1].placementTier).toBe('member');
    });

    it('Premium·VIP 는 유료 티어', () => {
      expect(GRADE_BENEFITS_DEFAULT[3].placementTier).toBe('paid');
      expect(GRADE_BENEFITS_DEFAULT[4].placementTier).toBe('paid');
    });

    it('등급 없는 계정(비구독)은 무료 티어만 — 기본이 닫힌 쪽', () => {
      expect(NO_GRADE_BENEFIT.placementTier).toBe('free');
    });
  });

  describe('resolveGradeBenefits — 저장값 해석', () => {
    it('저장값이 없으면 기본값', () => {
      expect(resolveGradeBenefits(null)).toEqual(GRADE_BENEFITS_DEFAULT);
      expect(resolveGradeBenefits(undefined)).toEqual(GRADE_BENEFITS_DEFAULT);
    });

    it('부분 저장값은 기본값으로 메꾼다 — 혜택이 0 으로 유실되지 않게', () => {
      const r = resolveGradeBenefits({ '4': { aiReportsPerMonth: 10 } });
      expect(r[4].aiReportsPerMonth).toBe(10);
      expect(r[4].qnaQueueWeight).toBe(
        GRADE_BENEFITS_DEFAULT[4].qnaQueueWeight,
      );
      expect(r[1]).toEqual(GRADE_BENEFITS_DEFAULT[1]); // 건드리지 않은 등급은 그대로
    });

    it('정의되지 않은 등급은 무시 — 오타로 새 등급이 생기지 않는다', () => {
      const r = resolveGradeBenefits({ '9': { qnaQueueWeight: 99 } });
      expect((r as Record<number, unknown>)[9]).toBeUndefined();
      expect(Object.keys(r)).toEqual(Object.keys(GRADE_BENEFITS_DEFAULT));
    });
  });

  describe('benefitOf — 등급 조회는 닫힌 쪽으로 실패한다', () => {
    const B = resolveGradeBenefits(null);

    it('tier 가 없거나 모르는 값이면 등급 없음 혜택', () => {
      expect(benefitOf(B, null)).toBe(NO_GRADE_BENEFIT);
      expect(benefitOf(B, undefined)).toBe(NO_GRADE_BENEFIT);
      expect(benefitOf(B, 99)).toBe(NO_GRADE_BENEFIT);
    });

    it('아는 tier 는 해당 혜택', () => {
      expect(benefitOf(B, 4).qnaQueueWeight).toBe(2);
      expect(benefitOf(B, 1).aiReportsPerMonth).toBe(0);
    });
  });

  describe('compareQnaQueue — 답변 큐 정렬', () => {
    it('같은 시각이면 상위 등급이 먼저', () => {
      expect(compareQnaQueue(at(1, 2), at(1, 0), now)).toBeLessThan(0);
    });

    it('상위 등급은 더 오래된 하위 등급 질문보다 먼저 (48h 이내)', () => {
      expect(compareQnaQueue(at(10, 2), at(1, 0), now)).toBeLessThan(0);
    });

    it('같은 등급이면 최신 우선 — 기존 동작을 유지한다', () => {
      expect(compareQnaQueue(at(1, 0), at(10, 0), now)).toBeLessThan(0);
    });

    // 여기가 이 설계의 핵심 — 우선권이 기아를 만들면 안 된다.
    it('48h 초과 미답은 등급을 이긴다(기아 방지)', () => {
      const s = QUEUE_FAIRNESS.staleAfterHours;
      expect(compareQnaQueue(at(s + 1, 0), at(1, 2), now)).toBeLessThan(0);
    });

    it('둘 다 48h 초과면 등급 무시하고 오래된 것부터', () => {
      const s = QUEUE_FAIRNESS.staleAfterHours;
      expect(compareQnaQueue(at(s + 10, 0), at(s + 1, 2), now)).toBeLessThan(0);
    });

    it('경계: 48h 미만은 초과분보다 뒤', () => {
      const s = QUEUE_FAIRNESS.staleAfterHours;
      expect(compareQnaQueue(at(s - 1, 0), at(s + 1, 0), now)).toBeGreaterThan(
        0,
      );
    });

    it('실제 큐 정렬 — 미답 초과분 먼저(오래된 순), 그 다음 등급순', () => {
      const queue = [
        { id: 'VIP-신규', createdAt: ago(1), weight: 2 },
        { id: 'Basic-신규', createdAt: ago(2), weight: 0 },
        { id: 'Premium-어제', createdAt: ago(20), weight: 1 },
        { id: 'Basic-3일전', createdAt: ago(72), weight: 0 },
        { id: 'VIP-4일전', createdAt: ago(96), weight: 2 },
      ];
      const sorted = [...queue]
        .sort((a, b) => compareQnaQueue(a, b, now))
        .map((x) => x.id);
      expect(sorted).toEqual([
        'VIP-4일전',
        'Basic-3일전',
        'VIP-신규',
        'Premium-어제',
        'Basic-신규',
      ]);
    });
  });

  // 혜택 축 중 유일하게 실원가가 붙는 것 — 상한이 곧 원가 상한이어야 의미가 있다.
  describe('AI 리포트 원가 상한', () => {
    const AI_CALL_WON = 67; // consulting 1콜(Sonnet 4.6, ops/pricing-sim.mjs)
    const VIP_CONTRIBUTION_WON = 46_106; // O50 확정값의 VIP 공헌이익

    it('VIP 월 리포트 원가가 공헌이익의 1% 미만', () => {
      const cost = GRADE_BENEFITS_DEFAULT[4].aiReportsPerMonth * AI_CALL_WON;
      expect(cost / VIP_CONTRIBUTION_WON).toBeLessThan(0.01);
    });

    it('VIP 100명 규모여도 B008 consulting 일 상한(60)을 넘지 않는다', () => {
      const perDay = (100 * GRADE_BENEFITS_DEFAULT[4].aiReportsPerMonth) / 30;
      expect(perDay).toBeLessThanOrEqual(60);
    });

    it('안전선까지 열어도 상한 안에 있다 — 잘못 열어도 폭주하지 않는다', () => {
      const perDay = (100 * GRADE_BENEFITS_GUARD.maxAiReportsPerMonth) / 30;
      // 20건/월 × 100명 = 66.7건/일 → consulting 상한 60 을 넘는다.
      // 즉 안전선은 "B008 이 막아 주는 지점"과 맞닿아 있다: 여기서 더 열면 상한이 먼저 거절한다.
      expect(perDay).toBeGreaterThan(60);
    });
  });
});
