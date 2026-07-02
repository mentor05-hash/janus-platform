/** 표시 포맷 순수 헬퍼(금액·크레딧). 금액·크레딧은 정수(원). */

/** 금액 → '1,234원'. */
export function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

/** 크레딧 → '1,234' (단위 표기는 호출측). */
export function credits(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}
