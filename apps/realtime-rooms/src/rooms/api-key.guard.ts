import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/** 프로비저닝 API 보호 — 호스트 백엔드가 서버-투-서버로 x-api-key 헤더 전달. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly key: string;
  constructor(config: ConfigService) { this.key = config.get<string>('ROOMS_API_KEY') || 'dev-rooms-api-key'; }
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const provided = (req.headers['x-api-key'] as string) || '';
    if (!provided || provided !== this.key) throw new UnauthorizedException('유효하지 않은 API 키');
    return true;
  }
}
