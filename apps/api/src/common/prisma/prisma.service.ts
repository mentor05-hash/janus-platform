import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 연결 수명주기 관리. (CLAUDE.md §7 — 동시성 보호는 도메인 서비스에서 트랜잭션 경계로.)
 * `prisma db pull` 전에는 모델이 비어 있을 수 있으나 연결/헬스체크에는 영향 없음.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
