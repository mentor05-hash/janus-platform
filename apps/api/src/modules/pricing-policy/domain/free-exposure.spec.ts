import {
  FREE_EXPOSURE_DEFAULT,
  FREE_EXPOSURE_GUARD,
  resolveFreeExposure,
} from './free-exposure';

describe('무료 노출 정책(N24)', () => {
  it('기본값은 법률 회신 전 보수적 설정 — 수치 마스킹·검색/상세 잠금', () => {
    expect(FREE_EXPOSURE_DEFAULT.maskNumbers).toBe(true);
    expect(FREE_EXPOSURE_DEFAULT.allowSearch).toBe(false);
    expect(FREE_EXPOSURE_DEFAULT.allowDetail).toBe(false);
    expect(FREE_EXPOSURE_DEFAULT.showTrendYears).toBe(0);
  });

  it('구간별 노출 수 기본값은 W2 D2 범위(3~5)의 하한', () => {
    expect(FREE_EXPOSURE_DEFAULT.perBandItems).toBe(3);
    expect(FREE_EXPOSURE_DEFAULT.perBandItems).toBeLessThanOrEqual(
      FREE_EXPOSURE_GUARD.maxPerBandItems,
    );
  });

  it('저장값이 없으면 기본값', () => {
    expect(resolveFreeExposure(null)).toEqual(FREE_EXPOSURE_DEFAULT);
    expect(resolveFreeExposure(undefined)).toEqual(FREE_EXPOSURE_DEFAULT);
  });

  it('부분 저장값은 기본값으로 메꾼다 — 누락 필드가 열린 상태로 새지 않게', () => {
    const r = resolveFreeExposure({ perBandItems: 5 });
    expect(r.perBandItems).toBe(5);
    expect(r.maskNumbers).toBe(true); // 저장에 없던 필드는 안전한 기본값 유지
    expect(r.allowSearch).toBe(false);
  });

  it('오염된 저장값이 있어도 나머지 정책은 유지된다', () => {
    const r = resolveFreeExposure({ allowDetail: true });
    expect(r.allowDetail).toBe(true);
    expect(r.showRelTierBadge).toBe(false);
  });

  // 배치표 생성기는 tier-policy.config.json 을 빌드 시 읽고 플랫폼은 위 기본값을 쓴다.
  // 둘이 갈라지면 무료판 산출물과 플랫폼이 서로 다른 노출 정책으로 동작한다 — 정합을 테스트로 고정한다.
  it('tier-policy.config.json 의 freeExposure 와 코드 기본값이 같다', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- JSON 정합 검증: 런타임에 실파일을 읽어야 의미가 있다
    const cfg = require('../../../../../../tier-policy.config.json') as {
      freeExposure: Record<string, unknown>;
    };
    expect(cfg.freeExposure).toEqual({ ...FREE_EXPOSURE_DEFAULT });
  });
});
