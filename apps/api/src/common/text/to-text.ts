/**
 * 타입을 모르는 값을 **사람이 읽을 문자열**로 바꾼다.
 *
 * 왜 `String()` 이 아닌가: 엑셀 파싱 결과·PG 웹훅 바디·Prisma JSON 컬럼처럼 타입이
 * `unknown`/`any` 인 값에 `String()` 을 쓰면, 객체가 들어온 순간 조용히
 * `"[object Object]"` 가 된다. 이 값들은 그대로 DB 에 저장되거나 CSV·알림 문구로 나가서
 * 잘못을 나중에야 알아챈다 — `@typescript-eslint/no-base-to-string` 이 잡는 게 이 결함이다.
 *
 * 그래서 원시값은 그대로 문자열로, 객체는 **JSON 으로** 남긴다. 내용이 보존되므로
 * 잘못된 입력이 들어와도 원본을 추적할 수 있다.
 */
export function toText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint')
    return String(v);
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return ''; // 순환참조 등 — 문자열 하나 때문에 호출부를 깨뜨리지 않는다
  }
}

/** `toText` + 앞뒤 공백 제거. 엑셀·폼 입력 정규화에 쓴다. */
export const toTrimmedText = (v: unknown): string => toText(v).trim();
