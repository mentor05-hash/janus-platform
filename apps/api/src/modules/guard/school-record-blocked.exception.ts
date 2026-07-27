import { HttpException, HttpStatus } from '@nestjs/common';
import type { ReasonCode } from '@mentoring/guard-school-record';
import { messageFor } from './school-record.messages';

/**
 * 생기부 감지 시 업로드 거부 예외.
 * AllExceptionsFilter 는 응답 객체의 문자열 `error` 를 그대로 오류 코드로 승격하므로
 * (`{ error:{ code:'SR_KEYWORD', message, requestId } }`), 웹이 SR_* 코드로 §4-b 모달을 띄운다.
 * 상태코드는 422(내용 기반 거부) — 클라이언트 재시도로 해결되지 않음을 명시.
 */
export class SchoolRecordBlockedException extends HttpException {
  constructor(public readonly reason: ReasonCode) {
    super(
      { error: reason, message: messageFor(reason) },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
