import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { RoomsService } from './rooms.service';
import { TokenService } from './token.service';

export type RoomAuth = { roomId: string; participantId: string };

/** 참가자 룸 토큰 검증(파일 업/다운로드 등). Authorization: Bearer <token> 또는 ?token=. epoch 폐기 반영. */
@Injectable()
export class RoomTokenGuard implements CanActivate {
  constructor(private readonly tokens: TokenService, private readonly svc: RoomsService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { roomAuth?: RoomAuth }>();
    const auth = req.headers['authorization'];
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    const token = bearer || (req.query['token'] as string | undefined);
    const payload = token ? this.tokens.verify(token) : null;
    if (!payload) throw new UnauthorizedException('유효하지 않은 룸 토큰');
    const room = await this.svc.getRoom(payload.roomId);
    if (!room || room.token_epoch !== payload.epoch) throw new UnauthorizedException('폐기되었거나 없는 룸');
    req.roomAuth = { roomId: payload.roomId, participantId: payload.participantId };
    return true;
  }
}
