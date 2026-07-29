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

/**
 * 메트릭 라벨로 쓰는 요청·응답 필드만 추린 최소 타입.
 *
 * `switchToHttp().getRequest()` 의 기본 반환은 `any` 라, 그대로 쓰면 여기서 뽑는 값이 전부
 * `any` 로 번져 라벨에 무엇이든 들어갈 수 있다(Prometheus 라벨은 카디널리티가 폭발하면
 * 수집기를 망가뜨린다). 제네릭으로 모양을 고정해 `method`·`route`·`status` 가 실제로
 * 문자열·숫자임을 타입으로 못박는다. `route.path` 는 express 가 라우터 매칭 후에만 붙이므로
 * 선택적이다 — 없으면 `normalizeRoute(path)` 로 폴백한다.
 */
type MetricsRequest = {
  method: string;
  path: string;
  route?: { path?: string };
};
type MetricsResponse = { statusCode: number };

/** HTTP 요청 수·처리시간 Prometheus 메트릭 기록(§10). */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const http = ctx.switchToHttp();
    const req = http.getRequest<MetricsRequest>();
    const res = http.getResponse<MetricsResponse>();
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
