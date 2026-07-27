import {
  SCORE_WEIGHTS,
  bestClassFitRatio,
  classFitRatio,
  commuteScore,
  freshScore,
  scoreAcademy,
} from './scoring';

describe('academy scoring (§5)', () => {
  it('가중치 합은 1', () => {
    const sum =
      SCORE_WEIGHTS.match + SCORE_WEIGHTS.commute + SCORE_WEIGHTS.fresh;
    expect(sum).toBeCloseTo(1, 9);
  });

  describe('commuteScore — 버스 경유 > 도보권 > 기타', () => {
    it('버스 경유가 최고점', () => {
      expect(commuteScore(true, 999)).toBe(1);
      expect(commuteScore(true, null)).toBe(1);
    });
    it('도보 분이 짧을수록 높다', () => {
      expect(commuteScore(false, 5)).toBeGreaterThan(commuteScore(false, 12));
      expect(commuteScore(false, 12)).toBeGreaterThan(commuteScore(false, 30));
    });
    it('역 정보 없으면 최저', () => {
      expect(commuteScore(false, null)).toBeLessThan(commuteScore(false, 20));
    });
  });

  describe('freshScore — verified + 최신도', () => {
    it('verified 가 신선도보다 크게 기여', () => {
      expect(freshScore(true, 999)).toBeGreaterThan(freshScore(false, 0));
    });
    it('최근 갱신일수록 높고 1 을 넘지 않는다', () => {
      expect(freshScore(true, 10)).toBeCloseTo(1, 9);
      expect(freshScore(true, 200)).toBeGreaterThan(freshScore(true, 400));
      expect(freshScore(false, 999)).toBe(0);
    });
  });

  describe('classFitRatio / bestClassFitRatio', () => {
    it('필터 미요청 시 중립 1', () => {
      expect(
        classFitRatio(
          { subject: '수학', level: 'basic', target_grades: [] },
          {},
        ),
      ).toBe(1);
      expect(bestClassFitRatio([], {})).toBe(1);
    });
    it('모든 요청 필터를 만족하면 1', () => {
      expect(
        classFitRatio(
          { subject: '수학', level: 'prep', target_grades: ['고3'] },
          { subject: '수학', level: 'prep', grade: '고3' },
        ),
      ).toBe(1);
    });
    it('일부만 만족하면 비율', () => {
      expect(
        classFitRatio(
          { subject: '수학', level: 'basic', target_grades: ['고1'] },
          { subject: '수학', level: 'prep', grade: '고3' },
        ),
      ).toBeCloseTo(1 / 3, 9);
    });
    it('여러 반 중 최고 적합을 취한다', () => {
      const classes = [
        { subject: '수학', level: 'basic', target_grades: ['고1'] },
        { subject: '수학', level: 'prep', target_grades: ['고3'] },
      ];
      expect(
        bestClassFitRatio(classes, {
          subject: '수학',
          level: 'prep',
          grade: '고3',
        }),
      ).toBe(1);
    });
    it('반이 없으면(필터 있음) 0', () => {
      expect(bestClassFitRatio([], { subject: '수학' })).toBe(0);
    });
  });

  describe('scoreAcademy — 종합', () => {
    it('0~1 범위', () => {
      const s = scoreAcademy({
        bestClassFitRatio: 1,
        busPass: true,
        walkMin: 3,
        verified: true,
        ageDays: 1,
      });
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });
    it('완전 적합·버스경유·verified·최신 = 만점', () => {
      expect(
        scoreAcademy({
          bestClassFitRatio: 1,
          busPass: true,
          verified: true,
          walkMin: 1,
          ageDays: 1,
        }),
      ).toBeCloseTo(1, 9);
    });
    it('버스 경유가 통학 점수를 끌어올려 더 높다(다른 조건 동일)', () => {
      const withBus = scoreAcademy({
        bestClassFitRatio: 1,
        busPass: true,
        walkMin: null,
        verified: false,
        ageDays: 400,
      });
      const noBus = scoreAcademy({
        bestClassFitRatio: 1,
        busPass: false,
        walkMin: null,
        verified: false,
        ageDays: 400,
      });
      expect(withBus).toBeGreaterThan(noBus);
    });
    it('거리 단독 정렬이 아니다 — 적합도 낮은 근거리보다 적합도 높은 원거리가 이길 수 있다', () => {
      const nearButUnfit = scoreAcademy({
        bestClassFitRatio: 0,
        busPass: true,
        walkMin: 1,
        verified: false,
        ageDays: 400,
      });
      const farButFit = scoreAcademy({
        bestClassFitRatio: 1,
        busPass: false,
        walkMin: 15,
        verified: true,
        ageDays: 10,
      });
      expect(farButFit).toBeGreaterThan(nearButUnfit);
    });
  });
});
