/**
 * thin-slice 필터(순수) — 전체 배치표 파일 대신 "조회 조건에 맞는 행만" 반환(O76).
 * 대량 유출 원천차단의 핵심: 결제 계정 1개로도 전체 데이터셋을 한 번에 받을 수 없다.
 * 데이터 형식: JANUS_DATA_DIR/placement-hub/slices/<slug>.json = { columns?, rows: object[] }.
 */
export type SliceRow = Record<string, unknown>;

export const SLICE_MAX_ROWS = 30; // 요청당 최대 행 — 화면 1회분
export const SLICE_MIN_QUERY = 2; // 검색어 최소 길이 — 빈 검색으로 전량 훑기 방지

export interface SliceResult {
  available: boolean;
  total: number; // 조건 일치 총계(참고용 카운트만 — 행은 limit 만큼만)
  rows: SliceRow[];
  capped: boolean; // limit 로 잘렸는지
}

/** q(2자+)가 행의 문자열 필드 어딘가에 포함되면 일치. limit 는 1..SLICE_MAX_ROWS 로 강제. */
export function filterSliceRows(
  rows: SliceRow[],
  q: string,
  limit = SLICE_MAX_ROWS,
): SliceResult {
  const term = (q ?? '').trim();
  if (term.length < SLICE_MIN_QUERY)
    return { available: true, total: 0, rows: [], capped: false };
  const lim = Math.min(
    SLICE_MAX_ROWS,
    Math.max(1, Math.floor(limit) || SLICE_MAX_ROWS),
  );
  const matched = rows.filter((r) =>
    Object.values(r).some((v) => typeof v === 'string' && v.includes(term)),
  );
  return {
    available: true,
    total: matched.length,
    rows: matched.slice(0, lim),
    capped: matched.length > lim,
  };
}
