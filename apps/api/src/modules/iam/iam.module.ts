import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * IAM 바운디드 컨텍스트 (CLAUDE.md §3).
 * Identity & Access — 계정·인증(JWT)·RBAC.
 * JwtStrategy('jwt') 를 등록해 전역 JwtAuthGuard(AppModule) 가 동작.
 */
@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class IamModule {}
