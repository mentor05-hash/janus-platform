import { FeatureRule, resolveFeatureEnabled } from './feature';

const C = 'center-1';
const q = { centerId: C, targetType: 'mode', targetValue: 'zoom' };

describe('기능 토글 해석(§5-8)', () => {
  it('규칙 없으면 기본값(열림)', () => {
    expect(resolveFeatureEnabled([], q)).toBe(true);
  });

  it('센터 자율 규칙 적용', () => {
    const rules: FeatureRule[] = [
      {
        scope: '센터',
        centerId: C,
        targetType: 'mode',
        targetValue: 'zoom',
        enabled: false,
      },
    ];
    expect(resolveFeatureEnabled(rules, q)).toBe(false);
  });

  it('충돌 시 전사 우선 — 전사 닫힘이 센터 열림을 덮어씀', () => {
    const rules: FeatureRule[] = [
      {
        scope: '센터',
        centerId: C,
        targetType: 'mode',
        targetValue: 'zoom',
        enabled: true,
      },
      {
        scope: '전사',
        centerId: null,
        targetType: 'mode',
        targetValue: 'zoom',
        enabled: false,
      },
    ];
    expect(resolveFeatureEnabled(rules, q)).toBe(false);
  });

  it('다른 센터 규칙은 영향 없음', () => {
    const rules: FeatureRule[] = [
      {
        scope: '센터',
        centerId: 'other',
        targetType: 'mode',
        targetValue: 'zoom',
        enabled: false,
      },
    ];
    expect(resolveFeatureEnabled(rules, q)).toBe(true);
  });
});
