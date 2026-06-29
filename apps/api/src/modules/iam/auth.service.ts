import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole, AccountStatus } from '../../config/enums';
import { JwtPayload } from './strategies/jwt.strategy';
import { LoginDto, SignupDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const account = await this.prisma.account.findUnique({ where: { login_id: dto.loginId } });
    if (!account || !(await bcrypt.compare(dto.password, account.pw_hash))) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
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
    const exists = await this.prisma.account.findUnique({ where: { login_id: dto.loginId } });
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

  async me(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, role: true, center_id: true, login_id: true, name: true, status: true },
    });
    if (!account) throw new UnauthorizedException();
    return account;
  }

  private async issueTokens(account: { id: string; role: string; center_id: string | null; login_id: string }) {
    const base = {
      sub: account.id,
      role: account.role as AccountRole,
      centerId: account.center_id,
      loginId: account.login_id,
    };
    const accessToken = await this.jwt.signAsync(
      { ...base, typ: 'access' } satisfies JwtPayload,
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: Number(this.config.get('JWT_ACCESS_TTL') ?? 900),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, typ: 'refresh' } satisfies JwtPayload,
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: Number(this.config.get('JWT_REFRESH_TTL') ?? 1209600),
      },
    );
    return { accessToken, refreshToken };
  }
}
