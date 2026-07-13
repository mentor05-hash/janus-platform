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
  ANTHROPIC_API_KEY?: string; // LLM_PROVIDER=claude 시 실모델 자격증명(후결합)

  @IsOptional()
  @IsString()
  ANTHROPIC_MODEL?: string; // 기본 claude-sonnet-4-6

  @IsOptional()
  @IsString()
  GATEWAY_LLM_DAILY_LIMIT?: string; // 관문 해석 일 호출 상한(비용 가드, 기본 200)

  @IsOptional()
  @IsString()
  JANUS_DATA_DIR?: string; // 저작권 데이터 루트(경로 하드코딩 금지 — CLAUDE.md §4). 배치표 허브 등이 참조

  @IsOptional()
  @IsString()
  SSO_JWT_SECRET?: string; // 크로스서비스 SSO 시크릿(O42) — rooms 와 분리, 미설정 시 dev 기본값

  @IsOptional()
  @IsString()
  ZOOM_PROVIDER?: string;

  @IsOptional()
  @IsString()
  CACHE_PROVIDER?: string;

  // 대시보드 권한 정책(§E 결정, 기본 OFF=본사급 독점). 'true' 일 때만 센터관리자에 확장.
  @IsOptional()
  @IsString()
  DASH_BENCHMARK_ANON?: string; // 센터관리자에 타 센터 익명 평균 노출

  @IsOptional()
  @IsString()
  DASH_CENTER_PAYROLL?: string; // 센터관리자 급여표 열람

  @IsOptional()
  @IsString()
  DASH_CENTER_WEIGHT_EDIT?: string; // 센터관리자 가중치 조정

  // 실시간 룸 서비스 이관 브리지(플래그). 'true' + URL 설정 시에만 활성(기본 off=기존 in-app).
  @IsOptional()
  @IsString()
  REALTIME_ROOMS_ENABLED?: string;

  @IsOptional()
  @IsString()
  ROOMS_API_URL?: string; // 서버-투-서버 내부 URL(예: http://realtime-rooms:3100)

  @IsOptional()
  @IsString()
  ROOMS_API_KEY?: string;

  @IsOptional()
  @IsString()
  ROOMS_PUBLIC_URL?: string; // 브라우저가 접속할 공개 URL(예: http://localhost:3100)
}

/** 대시보드 권한 ENV 플래그 — 'true' 만 활성, 그 외/부재는 false(fail-closed). */
export const dashFlag = (v: string | undefined): boolean => v === 'true';

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
