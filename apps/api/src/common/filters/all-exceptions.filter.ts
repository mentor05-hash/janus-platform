import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { getRequestId } from '../observability/request-context';
import { errorsTotal, normalizeRoute } from '../observability/metrics';

/** 고부하 신호(커넥션풀 고갈 P2024 · 트랜잭션 타임아웃 P2028)인가 — 500 아닌 503(재시도)으로. */
function isOverloadError(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    (e.code === 'P2024' ||
      e.code === 'P2028' ||
      /connection pool|expired transaction|Transaction (already closed|API error)/i.test(
        e.message,
      ))
  );
}

/**
 * 표준 오류 응답 형식 (CLAUDE.md §7): { error: { code, message } }.
 * HttpException 은 상태/메시지를 보존하고, 그 외는 500 INTERNAL 로 마스킹.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = '서버 오류가 발생했습니다.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = HttpStatus[status] ?? 'ERROR';
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        message =
          (Array.isArray(b.message)
            ? b.message.join(', ')
            : (b.message as string)) ?? message;
        if (typeof b.error === 'string')
          code = b.error.replace(/\s+/g, '_').toUpperCase();
      }
    } else if (isOverloadError(exception)) {
      // 동시성 포화(풀 고갈·트랜잭션 타임아웃) — 일시적 과부하이므로 503 + 재시도 안내.
      status = HttpStatus.SERVICE_UNAVAILABLE;
      code = 'SERVICE_BUSY';
      message = '지금 요청이 몰려 있어요. 잠시 후 다시 시도해 주세요.';
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    const requestId = getRequestId();
    if (status === HttpStatus.SERVICE_UNAVAILABLE)
      res.setHeader('Retry-After', '2');
    // 에러 메트릭(로컬 에러추적) — 코드·상태별 카운터
    errorsTotal.inc({ code, status });
    if (status >= 500) {
      // 구조적 에러 로그(JSON 로거) — 스택·경로·상관 requestId 포함
      this.logger.error(
        JSON.stringify({
          event: 'error',
          method: req.method,
          route: normalizeRoute(req.path),
          status,
          code,
          requestId,
          message,
          stack:
            exception instanceof Error
              ? exception.stack?.split('\n').slice(0, 4).join(' | ')
              : undefined,
        }),
      );
    }

    res.status(status).json({ error: { code, message, requestId } });
  }
}
