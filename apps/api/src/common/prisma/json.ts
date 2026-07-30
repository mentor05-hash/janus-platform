import { Prisma } from '@prisma/client';

/**
 * Prisma **JSON 컬럼에 쓸 값**으로 통과시킨다.
 *
 * 왜 헬퍼인가: Prisma 의 `InputJsonValue` 는 객체에 index signature 를 요구한다. 그런데
 * DTO·도메인 타입은 대부분 이름 붙은 interface/클래스라 구조가 같아도 **대입이 거부된다**
 * (`Type 'ScheduleSlotDto[]' is not assignable to type 'JsonNull | InputJsonValue'`).
 * TypeScript 가 이름 붙은 타입에 암묵적 index signature 를 주지 않기 때문이고, 값 자체는
 * 언제나 JSON 직렬화 가능하다 — 즉 **타입 표현의 한계지 안전성 문제가 아니다**.
 *
 * 그래서 이전에는 호출부마다 `as object` 를 흩뿌렸는데, 여기에 두 가지 대가가 있었다:
 *   ① `@typescript-eslint/no-unnecessary-type-assertion` 이 이 단언을 "불필요"로 **오판**한다.
 *      eslint 는 문맥 타입(`object` 자리)만 보고 assignable 하다고 판단하지만, 실제로 지우면
 *      tsc 가 위 오류로 거부한다. 규칙의 자동수정이 빌드를 깨뜨려 **규칙을 통째로 꺼 뒀었다**.
 *   ② `as object` 는 "왜 필요한지"를 남기지 못해, 읽는 사람이 안전하지 않은 캐스트와 구분할 수 없다.
 *
 * 이 함수는 그 단언을 **한 곳에 모으고 이유를 붙인다**. 입력이 `unknown` 이라 내부 단언은
 * 실제로 타입을 바꾸므로 규칙이 오판하지 않고, 호출부에는 단언이 남지 않는다.
 *
 * ⚠ 넘기는 값은 JSON 직렬화 가능해야 한다(Date·BigInt·Map·순환참조 금지 — Prisma 가 던진다).
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** `toJson` 의 선택적 버전 — null·undefined 는 그대로 흘려 "필드 미설정"을 유지한다. */
export function toJsonOrUndefined(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null ? undefined : toJson(value);
}
