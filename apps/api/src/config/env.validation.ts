import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

/**
 * ENV 검증 (CLAUDE.md §10 설정 외부화). 부팅 시 누락/오타를 즉시 실패시킨다.
 * 미결정 단가/키는 IsOptional — 어댑터가 mock 일 때 비어 있어도 동작.
 */
export class EnvironmentVariables {
  @IsIn(['local', 'staging', 'prod', 'test'])
  NODE_ENV!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  API_PREFIX?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsString()
  PORT?: string;

  @IsOptional()
  @IsString()
  WEEKLY_GRANT_CRON?: string;

  @IsOptional()
  @IsString()
  GRANT_EXPIRE_CRON?: string;

  // 외부 의존 어댑터 선택자 — 로컬은 mock/none/local
  @IsOptional()
  @IsString()
  PG_PROVIDER?: string;

  @IsOptional()
  @IsString()
  NOTIFICATION_PROVIDER?: string;

  @IsOptional()
  @IsString()
  STORAGE_PROVIDER?: string;

  @IsOptional()
  @IsString()
  LLM_PROVIDER?: string;

  @IsOptional()
  @IsString()
  ZOOM_PROVIDER?: string;

  @IsOptional()
  @IsString()
  CACHE_PROVIDER?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `환경변수 검증 실패:\n${errors
        .map(
          (e) =>
            `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
        )
        .join('\n')}`,
    );
  }
  return validated;
}
