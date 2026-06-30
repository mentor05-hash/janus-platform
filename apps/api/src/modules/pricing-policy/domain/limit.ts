/**
 * 한도 정책 (CLAUDE.md §5-9).
 * 한도 축소 시 기존은 동결(유지)되고 신규 추가만 차단된다.
 * → 추가 가능 여부는 "현재 보유 수 < 한도" 로만 판정(기존 제거 없음).
 */
export function canAddWithinLimit(
  currentCount: number,
  limit: number | null | undefined,
): boolean {
  if (limit === null || limit === undefined) return true; // 무제한
  return currentCount < limit;
}
