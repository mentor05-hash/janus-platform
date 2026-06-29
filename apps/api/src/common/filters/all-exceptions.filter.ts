import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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
        message = (Array.isArray(b.message) ? b.message.join(', ') : (b.message as string)) ?? message;
        if (typeof b.error === 'string') code = (b.error as string).replace(/\s+/g, '_').toUpperCase();
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${status} ${code}`);
    }

    res.status(status).json({ error: { code, message } });
  }
}
