import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getRequestId } from './request-context';

/**
 * 요청 로깅 인터셉터 (§10 관측성) — 완료/오류 시 method·url·status·소요시간(ms) 기록.
 * requestId 는 ALS 에서 가져와 상관관계 부여.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const start = Date.now();
    const rid = getRequestId();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(
            `${req.method} ${req.url} → ${res.statusCode} ${Date.now() - start}ms rid=${rid}`,
          ),
        error: (err) =>
          this.logger.warn(
            `${req.method} ${req.url} → ERR ${Date.now() - start}ms rid=${rid} ${(err as Error)?.message ?? ''}`,
          ),
      }),
    );
  }
}
