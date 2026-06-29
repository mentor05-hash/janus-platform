import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountRole } from '../../config/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RBAC 역할 가드. @Roles(...) 메타데이터와 req.user.role 을 대조.
 * 권한레벨(L1/L2/L3)은 staff 전용으로 Phase 2 에서 별도 가드로 확장.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AccountRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const role = req.user?.role as AccountRole | undefined;
    if (role && required.includes(role)) return true;

    throw new ForbiddenException('이 작업을 수행할 권한이 없습니다.');
  }
}
