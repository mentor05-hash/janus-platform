import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { AccountRole } from '../../../config/enums';

export interface JwtPayload {
  sub: string; // account id
  role: AccountRole;
  centerId: string | null;
  loginId: string;
  typ: 'access' | 'refresh';
  jti?: string; // refresh 토큰 식별자 — 서버측 회전/무효화(§10)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('액세스 토큰이 아닙니다.');
    }
    return {
      id: payload.sub,
      role: payload.role,
      centerId: payload.centerId,
      loginId: payload.loginId,
    };
  }
}
