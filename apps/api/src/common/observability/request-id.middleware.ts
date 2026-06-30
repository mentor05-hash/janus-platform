import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context';

/**
 * 요청 ID 미들웨어 (§10) — 헤더 x-request-id 가 있으면 승계, 없으면 생성.
 * ALS 컨텍스트에 저장하고 응답 헤더로 반향(클라이언트·게이트웨이 상관관계).
 * 전역 express 미들웨어로 등록(app.use) — 글로벌 prefix·라우트 매칭에 무관하게 선행 실행.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers['x-request-id'];
  const requestId =
    (Array.isArray(header) ? header[0] : header) || randomUUID();
  res.setHeader('x-request-id', requestId);
  requestContext.run({ requestId }, () => next());
}
