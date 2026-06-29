import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../decorators/current-user.decorator';
import { MIN_PERM_KEY } from '../decorators/min-perm.decorator';
import { PermLevel, permAtLeast, PERM_TIER } from '../../config/perm';

/**
 * 권한레벨 가드 (§iam). @MinPerm 이 붙은 핸들러만 검사. perm_level 은 토큰에서 옴.
 */
@Injectable()
export class PermLevelGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const need = this.reflector.getAllAndOverride<PermLevel>(MIN_PERM_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!need) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!permAtLeast(user?.permLevel, need)) {
      throw new ForbiddenException(`${PERM_TIER[need]} 이상 권한이 필요합니다.`);
    }
    return true;
  }
}
