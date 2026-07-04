import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export const PG = Symbol('PG_POOL');

/** 종료 훅에서 커넥션 풀 정리(graceful shutdown). */
@Injectable()
class PgLifecycle implements OnModuleDestroy {
  constructor(@Inject(PG) private readonly pool: Pool) {}
  async onModuleDestroy() { await this.pool.end().catch(() => {}); }
}

/** rooms 스키마에 격리된 pg 풀. search_path 로 이 서비스 테이블만 바라봄. */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connectionString = config.get<string>('ROOMS_DATABASE_URL') || config.get<string>('DATABASE_URL');
        return new Pool({ connectionString, options: '-c search_path=rooms,public', max: Number(process.env.ROOMS_PG_POOL ?? 10) });
      },
    },
    PgLifecycle,
  ],
  exports: [PG],
})
export class DbModule {}
