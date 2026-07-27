import { buildJanusScoreParams, toJanusScore } from './janus-score';

const item = (
  subject: string,
  score: number | null,
  grade: string | null = null,
) => ({ subject, score, grade });

describe('toJanusScore (O43 v22 키 동결 + C1 계약)', () => {
  it('표점 4종 완비 → mode std', () => {
    const r = toJanusScore({
      period: '2026-06_모평',
      source: 'ocr',
      placement: { gye: '이과' },
      items: [
        item('국어', 131),
        item('수학', 135),
        item('탐구1', 65),
        item('탐구2', 64),
        item('영어', null, '1'),
        item('한국사', null, '2'),
      ],
    });
    expect(r).toMatchObject({
      gye: '이과',
      mode: 'std',
      kor: 131,
      mat: 135,
      tam1: 65,
      tam2: 64,
      eng: 1,
      han: 2,
      period: '2026-06_모평',
      source: 'ocr',
    });
  });

  it('placement.nb 있으면 전국누백 모드 우선', () => {
    const r = toJanusScore({
      period: '2026-06_모평',
      source: 'manual',
      placement: { gye: '문과', nb: 1.53 },
      items: [
        item('국어', 120),
        item('수학', 110),
        item('탐구1', 60),
        item('탐구2', 61),
      ],
    });
    expect(r).toMatchObject({ gye: '문과', mode: 'nb', nb: 1.53 });
    expect(r).not.toHaveProperty('kor');
  });

  it('과목 별칭(사회/과학→탐구) 흡수 · 탐구 결측이면 산출 불가(null)', () => {
    const ok = toJanusScore({
      period: 'p',
      source: 'manual',
      placement: null,
      items: [
        item('국어', 100),
        item('수학', 100),
        item('과학', 60),
        item('탐구2', 61),
      ],
    });
    expect(ok?.mode).toBe('std');
    const miss = toJanusScore({
      period: 'p',
      source: 'manual',
      placement: null,
      items: [item('국어', 100), item('수학', 100), item('과학', 60)],
    });
    expect(miss).toBeNull();
  });

  it('검증 위반 필드는 무시(§5): 표점 200 초과 → null 산출, 등급 범위 밖 → eng 생략', () => {
    const r = toJanusScore({
      period: 'p',
      source: 'manual',
      placement: null,
      items: [
        item('국어', 250),
        item('수학', 100),
        item('탐구1', 60),
        item('탐구2', 61),
        item('영어', null, '0'),
      ],
    });
    expect(r).toBeNull(); // kor 무효 → 4종 미완
  });

  it('gye 미확정 값은 null(사용자 선택 유도)', () => {
    const r = toJanusScore({
      period: 'p',
      source: 'manual',
      placement: { gye: 'ga' },
      items: [
        item('국어', 100),
        item('수학', 100),
        item('탐구1', 60),
        item('탐구2', 61),
      ],
    });
    expect(r?.gye).toBeNull();
  });

  it('리포트 없음 → null', () => {
    expect(toJanusScore(null)).toBeNull();
  });
});

describe('buildJanusScoreParams (v22 URL 키 불변)', () => {
  it('std 모드', () => {
    const q = buildJanusScoreParams({
      gye: '이과',
      mode: 'std',
      kor: 131,
      mat: 135,
      tam1: 65,
      tam2: 64,
      eng: 1,
      han: 2,
      period: 'p',
      source: 's',
    });
    expect(q).toContain('gye=%EC%9D%B4%EA%B3%BC');
    expect(q).toContain('kor=131');
    expect(q).toContain('han=2');
    expect(q).not.toContain('nb=');
  });

  it('nb 모드', () => {
    const q = buildJanusScoreParams({
      gye: null,
      mode: 'nb',
      nb: 1.5,
      period: 'p',
      source: 's',
    });
    expect(q).toContain('nb=1.5');
    expect(q).not.toContain('kor=');
  });
});
