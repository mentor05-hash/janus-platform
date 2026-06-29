import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 표준 성공 응답 형식 (CLAUDE.md §7): { data, meta }.
 * 컨트롤러가 이미 { data, meta } 형태로 반환하면(목록 등) 그대로 통과시킨다.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, { data: T; meta?: unknown }> {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<{ data: T; meta?: unknown }> {
    return next.handle().pipe(
      map((payload) => {
        if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
          return payload as { data: T; meta?: unknown };
        }
        return { data: payload as T };
      }),
    );
  }
}
