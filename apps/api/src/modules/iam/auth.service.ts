import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'node:crypto';
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

  private readonly logger = new Logger('Auth');
  private static readonly MAX_FAILS = 5;
  private static readonly LOCK_WINDOW = 900; // 15분
  private get isProd() {
    return (this.config.get<string>('APP_ENV') ?? this.config.get<string>('NODE_ENV')) === 'prod';
  }

  /** 계정의 현재 유효 refresh jti 저장 키(§10 서버측 회전/무효화). */
  private refreshKey(accountId: string) {
    return `refresh:${accountId}`;
  }
  private failKey(loginId: string) {
    return `authfail:${loginId}`;
  }

  async login(dto: LoginDto) {
    // 계정 잠금: 최근 실패 누적 시 차단(브루트포스 완화)
    const fk = this.failKey(dto.loginId);
    const fails = Number((await this.cache.get<number>(fk)) ?? 0);
    if (fails >= AuthService.MAX_FAILS) {
      throw new HttpException(
        '로그인 시도가 많아 계정이 일시 잠겼습니다. 15분 후 다시 시도하거나 비밀번호를 재설정하세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const account = await this.prisma.account.findUnique({
      where: { login_id: dto.loginId },
    });
    if (!account || !(await bcrypt.compare(dto.password, account.pw_hash))) {
      await this.cache.incr(fk, AuthService.LOCK_WINDOW); // 실패 카운트+윈도우
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
    await this.cache.del(fk); // 성공 시 실패 카운트 초기화
    return this.issueTokens(account);
  }

  // ── 비밀번호 재설정 (Redis 토큰, mock 발송) ──
  async requestPasswordReset(loginId: string) {
    const account = await this.prisma.account.findUnique({ where: { login_id: loginId } });
    // 계정 존재 여부를 노출하지 않되, 있으면 토큰 발급
    let devToken: string | undefined;
    if (account && account.status === AccountStatus.APPROVED) {
      const token = randomUUID();
      await this.cache.set(`pwreset:${token}`, account.id, 1800); // 30분
      // mock 발송: 실제로는 이메일/SMS. 데모는 로그 + 비prod 응답에 토큰 노출.
      this.logger.log(`[mock] 비밀번호 재설정 링크 발송 → ${loginId} token=${token}`);
      if (!this.isProd) devToken = token;
    }
    return { ok: true, message: '가입된 계정이면 재설정 안내를 보냈습니다.', devToken };
  }
  async confirmPasswordReset(token: string, newPassword: string) {
    const accountId = await this.cache.get<string>(`pwreset:${token}`);
    if (!accountId) throw new BadRequestException('유효하지 않거나 만료된 토큰입니다.');
    if (!newPassword || newPassword.length < 6) throw new BadRequestException('비밀번호는 6자 이상이어야 합니다.');
    const pwHash = await bcrypt.hash(newPassword, 10);
    const acc = await this.prisma.account.update({ where: { id: accountId }, data: { pw_hash: pwHash } });
    await this.cache.del(`pwreset:${token}`);
    await this.cache.del(this.failKey(acc.login_id)); // 잠금 해제
    await this.cache.del(this.refreshKey(accountId)); // 기존 세션 무효화
    return { ok: true, message: '비밀번호가 변경되었습니다.' };
  }

  // ── 이메일/휴대폰 인증 (Redis 코드, mock 발송) ──
  async requestVerify(accountId: string, channel: 'email' | 'phone', target: string) {
    if (!target?.trim()) throw new BadRequestException('연락처를 입력하세요.');
    const code = String(randomInt(100000, 1000000));
    // 저장: 대상 + 코드
    await this.cache.set(`verify:${channel}:${accountId}`, `${target.trim()}|${code}`, 600); // 10분
    await this.prisma.account.update({
      where: { id: accountId },
      data: channel === 'email' ? { email: target.trim(), email_verified: false } : { phone: target.trim(), phone_verified: false },
    });
    this.logger.log(`[mock] ${channel} 인증코드 발송 → ${target} code=${code}`);
    return { ok: true, message: `${channel === 'email' ? '이메일' : '휴대폰'}로 인증코드를 발송했습니다.`, devCode: this.isProd ? undefined : code };
  }
  async confirmVerify(accountId: string, channel: 'email' | 'phone', code: string) {
    const saved = await this.cache.get<string>(`verify:${channel}:${accountId}`);
    if (!saved) throw new BadRequestException('인증코드가 만료되었습니다. 다시 요청하세요.');
    const [, savedCode] = saved.split('|');
    if (code !== savedCode) throw new BadRequestException('인증코드가 일치하지 않습니다.');
    await this.prisma.account.update({
      where: { id: accountId },
      data: channel === 'email' ? { email_verified: true } : { phone_verified: true },
    });
    await this.cache.del(`verify:${channel}:${accountId}`);
    return { ok: true, message: `${channel === 'email' ? '이메일' : '휴대폰'} 인증이 완료되었습니다.` };
  }
  async myContact(accountId: string) {
    const a = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { email: true, phone: true, email_verified: true, phone_verified: true },
    });
    if (!a) throw new NotFoundException('계정을 찾을 수 없습니다.');
    return a;
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
