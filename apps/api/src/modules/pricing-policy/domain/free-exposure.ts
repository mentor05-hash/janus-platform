/**
 * 무료 티어 노출 정책 (N24 — 실행계획서 W2 D2 "추천 4구간 각 3~5개 노출·색상만(수치 마스킹)").
 *
 * 왜 정책값인가: 무료 공개 범위는 데이터 권리 법률 회신(백로그 B007)에 따라 상향/하향해야 한다.
 * 코드에 박아두면 회신마다 배포가 필요해 법률 검토가 런칭 블로커가 된다 — 되돌릴 수 있는 값으로 둔다.
 * 단일 소스는 repo 루트 `tier-policy.config.json`(배치표 생성기가 빌드 시 읽음)이고,
 * 플랫폼은 아래 기본값 ← system_setting override 순으로 해석한다(다른 정책들과 같은 패턴).
 */
export const FREE_EXPOSURE_KEY = 'free_exposure_policy';

export interface FreeExposurePolicy {
  /** 추천 4구간(안정/적정/소신/상향)별 무료 노출 항목 수 */
  perBandItems: number;
  /** 실측 컷·백분위 등 원본 수치 마스킹(색상·구간만 노출) */
  maskNumbers: boolean;
  /** 대학·학과 검색 허용 — 열면 전수 열람에 가까워진다 */
  allowSearch: boolean;
  /** 카드 상세(근거 4종 전문) 열람 허용 */
  allowDetail: boolean;
  /** 다년 추세 노출 연수(0=미노출) */
  showTrendYears: number;
  /** 예측 신뢰도 등급 배지 — 수치가 아니라 등급이라 무료에서도 노출 */
  showConfidenceBadge: boolean;
  /** 상대 티어 배지 — 원본 컷 추정에 가까워 회원 이상 */
  showRelTierBadge: boolean;
}

/**
 * 법률 회신 전 보수적 기본값. W2 D2 가 제시한 "3~5개" 범위의 **하한**을 택했다 —
 * 회신 후 늘리는 것은 쉽지만, 이미 공개한 범위를 줄이는 것은 되돌릴 수 없다.
 */
export const FREE_EXPOSURE_DEFAULT: FreeExposurePolicy = {
  perBandItems: 3,
  maskNumbers: true,
  allowSearch: false,
  allowDetail: false,
  showTrendYears: 0,
  showConfidenceBadge: true,
  showRelTierBadge: false,
};

/** 무료 공개 안전선 — 이 범위를 넘기려면 법률 회신 근거가 필요하다(B007). */
export const FREE_EXPOSURE_GUARD = { maxPerBandItems: 5 } as const;

/** 저장값이 부분적/오염돼 있어도 기본값으로 메꿔 안전한 정책을 만든다. */
export function resolveFreeExposure(stored: unknown): FreeExposurePolicy {
  const s = (stored ?? {}) as Partial<FreeExposurePolicy>;
  return { ...FREE_EXPOSURE_DEFAULT, ...s };
}
