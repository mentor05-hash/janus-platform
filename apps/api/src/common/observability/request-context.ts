import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 요청 컨텍스트 (CLAUDE.md §10 관측성). 요청 단위 메타(requestId)를 ALS 로 전파해
 * 로그·오류응답에 상관관계 ID 를 부여한다. 인스턴스 무상태 — 요청별 격리.
 */
export interface RequestContext {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
