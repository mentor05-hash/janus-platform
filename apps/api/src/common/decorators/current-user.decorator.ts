import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AccountRole } from '../../config/enums';

/** 인증된 요청 주체(JwtStrategy.validate 결과). */
export interface AuthUser {
  id: string;
  role: AccountRole;
  centerId: string | null;
  loginId: string;
  permLevel?: string | null; // 관리자 권한레벨 L1/L2/L3 (§iam) — staff 만
}

/** 컨트롤러에서 현재 사용자 추출: foo(@CurrentUser() user: AuthUser) */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthUser | undefined,
    ctx: ExecutionContext,
  ): AuthUser | AuthUser[keyof AuthUser] => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser;
    return data ? user?.[data] : user;
  },
);
