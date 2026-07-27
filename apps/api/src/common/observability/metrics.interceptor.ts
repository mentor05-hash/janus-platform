import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  httpRequestDuration,
  httpRequestsTotal,
  normalizeRoute,
} from './metrics';

/** HTTP 요청 수·처리시간 Prometheus 메트릭 기록(§10). */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const method = req.method;
    const route = req.route?.path ?? normalizeRoute(req.path);
    const end = httpRequestDuration.startTimer({ method, route });
    return next.handle().pipe(
      tap({
        next: () => {
          httpRequestsTotal.inc({ method, route, status: res.statusCode });
          end();
        },
        error: () => {
          httpRequestsTotal.inc({
            method,
            route,
            status: res.statusCode || 500,
          });
          end();
        },
      }),
    );
  }
}
