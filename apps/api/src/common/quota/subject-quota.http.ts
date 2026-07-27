import { HttpException, HttpStatus } from '@nestjs/common';
import { SubjectQuotaExceededError } from './subject-quota';

/**
 * 사용자별 한도 초과 → HTTP 변환 (B221).
 *
 * 세 경계를 **서로 다른 상태코드**로 내보내는 것이 이 파일의 전부다.
 * 예전에는 모두 503 이었고, 그래서 클라이언트가 이 셋을 구분할 수 없었다:
 *   - 남용 방지(속도 제한)      → 429. 잠시 후 다시 하면 된다.
 *   - 권리 소진(사업적 경계)    → 402. 이번 달 몫을 다 썼다 → 상위 등급 안내가 붙는다.
 *   - 전역 상한(회사 사정)      → 503. 사용자 잘못이 아니다(`toHttp` in quota-llm.provider).
 *
 * 운영 수치(상한·잔여)는 메시지에 넣지 않는다 — 전역 상한과 같은 규칙이다.
 * 다만 `retryAfterHint` 로 "언제 풀리는지"만 알려 준다(오늘/이번 달).
 */
export function subjectQuotaToHttp(
  e: SubjectQuotaExceededError,
): HttpException {
  const when = e.period === 'month' ? '다음 달' : '내일';

  if (e.kind === 'entitlement') {
    return new HttpException(
      {
        error: {
          code: 'ENTITLEMENT_EXHAUSTED',
          message: `이번 ${e.period === 'month' ? '달' : '날'} 사용 가능한 횟수를 모두 사용했습니다. ${when} 다시 이용하거나 상위 등급으로 변경해 주세요.`,
          // 클라이언트가 업그레이드 CTA 를 띄울지 판단하는 힌트
          upgradable: true,
          retryAfterHint: e.period,
        },
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  return new HttpException(
    {
      error: {
        code: 'RATE_LIMITED',
        message: `요청이 너무 많습니다. ${when} 다시 시도해 주세요.`,
        upgradable: false,
        retryAfterHint: e.period,
      },
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
