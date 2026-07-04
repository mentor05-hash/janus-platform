import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export const PG = Symbol('PG_POOL');

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
        return new Pool({ connectionString, options: '-c search_path=rooms,public' });
      },
    },
  ],
  exports: [PG],
})
export class DbModule {}
