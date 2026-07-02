import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeController } from './realtime.controller';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/** 실시간(WebSocket) — 예약 채팅·화이트보드 + 유저룸 알림 + 기능 정책. */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.get<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [RealtimeController],
  providers: [RealtimeService, RealtimeGateway],
  exports: [RealtimeGateway, RealtimeService],
})
export class RealtimeModule {}
