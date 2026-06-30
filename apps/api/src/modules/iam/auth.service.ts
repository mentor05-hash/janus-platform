import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole, AccountStatus } from '../../config/enums';
import { permTier } from '../../config/perm';
import { JwtPayload } from './strategies/jwt.strategy';
import { LoginDto, SignupDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  /** 계정의 현재 유효 refresh jti 저장 키(§10 서버측 회전/무효화). */
  private refreshKey(accountId: string) {
    return `refresh:${accountId}`;
  }

  async login(dto: LoginDto) {
    const account = await this.prisma.account.findUnique({
      where: { login_id: dto.loginId },
    });
    if (!account || !(await bcrypt.compare(dto.password, account.pw_hash))) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }
    if (dto.centerId && account.center_id !== dto.centerId) {
      throw new UnauthorizedException('선택한 센터 소속이 아닙니다.');
    }
    if (account.status !== AccountStatus.APPROVED) {
      throw new ForbiddenException('승인 대기 중이거나 비활성 계정입니다.');
    }
    return this.issueTokens(account);
  }

  async signup(dto: SignupDto) {
    const exists = await this.prisma.account.findUnique({
      where: { login_id: dto.loginId },
    });
    if (exists) throw new ConflictException('이미 사용 중인 아이디입니다.');

    const pwHash = await bcrypt.hash(dto.password, 10);
    const account = await this.prisma.account.create({
      data: {
        role: dto.role,
        center_id: dto.centerId ?? null,
        login_id: dto.loginId,
        pw_hash: pwHash,
        name: dto.name,
        status: AccountStatus.PENDING, // 가입은 승인 대기(§ HR 승인 후 활성)
      },
    });
    return { id: account.id, status: account.status };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('유효하지 않은 refresh 토큰입니다.');
    }
    if (payload.typ !== 'refresh')
      throw new UnauthorizedException('refresh 토큰이 아닙니다.');
    // 서버측 회전/무효화(§10): 저장된 현재 jti 와 일치해야 함(재사용·로그아웃된 토큰 거부).
    const current = await this.cache.get<string>(this.refreshKey(payload.sub));
    if (!current || current !== payload.jti) {
      throw new UnauthorizedException(
        '재사용되었거나 무효화된 refresh 토큰입니다.',
      );
    }
    const account = await this.prisma.account.findUnique({
      where: { id: payload.sub },
    });
    if (!account) throw new UnauthorizedException();
    if (account.status !== AccountStatus.APPROVED) {
      throw new ForbiddenException('비활성 계정입니다.');
    }
    return this.issueTokens(account); // 새 jti 로 회전(이전 토큰 무효)
  }

  /** 로그아웃(§10) — 서버측 refresh 무효화. 이후 해당 refresh 토큰으로 갱신 불가. */
  async logout(accountId: string) {
    await this.cache.del(this.refreshKey(accountId));
    return { ok: true };
  }

  async me(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        role: true,
        center_id: true,
        login_id: true,
        name: true,
        status: true,
      },
    });
    if (!account) throw new UnauthorizedException();
    const staff = await this.prisma.staff_profile.findUnique({
      where: { account_id: accountId },
      select: { perm_level: true },
    });
    const tier = permTier(staff?.perm_level);
    return {
      ...account,
      permLevel: staff?.perm_level ?? null,
      adminTier: tier,
    };
  }

  private async issueTokens(account: {
    id: string;
    role: string;
    center_id: string | null;
    login_id: string;
  }) {
    // 관리자/직원 권한레벨(L1/L2/L3) — staff_profile 에서 로드해 토큰에 포함(§iam).
    const staff = await this.prisma.staff_profile.findUnique({
      where: { account_id: account.id },
      select: { perm_level: true },
    });
    const base = {
      sub: account.id,
      role: account.role as AccountRole,
      centerId: account.center_id,
      loginId: account.login_id,
      permLevel: staff?.perm_level ?? null,
    };
    const accessToken = await this.jwt.signAsync(
      { ...base, typ: 'access' } satisfies JwtPayload,
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: Number(this.config.get('JWT_ACCESS_TTL') ?? 900),
      },
    );
    const jti = randomUUID();
    const refreshTtl = Number(this.config.get('JWT_REFRESH_TTL') ?? 1209600);
    const refreshToken = await this.jwt.signAsync(
      { ...base, typ: 'refresh', jti } satisfies JwtPayload,
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl,
      },
    );
    // 현재 유효 jti 저장(회전 시 덮어써 이전 토큰 무효, 로그아웃 시 삭제) — §10
    await this.cache.set(this.refreshKey(account.id), jti, refreshTtl);
    return { accessToken, refreshToken };
  }
}
