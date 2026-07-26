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
  // 'production' 도 허용(관례적 값) — 부팅 실패 방지. 운영 판정은 isProdEnv 로 정규화.
  @IsIn(['local', 'staging', 'prod', 'production', 'test'])
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

  // 생기부 가드(스텝3) — 컨설팅 업로드 토글 자동 활성 스케줄. cron 식 + 활성 시각(ISO) 오버라이드.
  // 기본: '*/5 * * * *' 폴링, 활성 시각 2026-07-29T00:00:00+09:00(제25조의2 시행). 테스트에서 시각 주입.
  @IsOptional()
  @IsString()
  SR_CONSULTING_ACTIVATION_CRON?: string;

  @IsOptional()
  @IsString()
  SR_CONSULTING_ACTIVATION_AT?: string;

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

  // ── B008 유료 외부 API 일 상한 ──────────────────────────────
  // 용도별 상한 키는 LLM_DAILY_LIMIT_<PURPOSE> (llm.limits.ts 의 LLM_PURPOSES 와 같은 이름).
  @IsOptional()
  @IsString()
  LLM_DAILY_CALL_LIMIT?: string; // 전 용도 합산

  @IsOptional()
  @IsString()
  LLM_DAILY_LIMIT_REPORT?: string;

  @IsOptional()
  @IsString()
  LLM_DAILY_LIMIT_SIMILARITY?: string;

  @IsOptional()
  @IsString()
  LLM_DAILY_LIMIT_DRAFT?: string;

  @IsOptional()
  @IsString()
  LLM_DAILY_LIMIT_OCR?: string;

  @IsOptional()
  @IsString()
  LLM_DAILY_LIMIT_VISION?: string;

  @IsOptional()
  @IsString()
  LLM_DAILY_LIMIT_CONSULTING?: string;

  @IsOptional()
  @IsString()
  LLM_DAILY_LIMIT_GATEWAY?: string;

  @IsOptional()
  @IsString()
  LLM_DAILY_LIMIT_CONSULTREPORT?: string;

  @IsOptional()
  @IsString()
  LLM_QUOTA_FAIL_OPEN?: string; // 'true' 면 카운터 장애 시 통과(기본은 차단 — 비용 보호)

  // ── B221 층 분리 ──────────────────────────────────────────
  @IsOptional()
  @IsString()
  LLM_ENTITLED_RESERVE_PCT?: string; // 합산 상한 중 매출 연동 용도 예약 비율(0~0.9). 기본 0.4

  @IsOptional()
  @IsString()
  LLM_REPORT_REVIEW_PER_USER_DAY?: string; // 사용자 1인 일 신고 AI 검토. 기본 5

  @IsOptional()
  @IsString()
  LLM_SIMILARITY_PER_USER_DAY?: string; // 교사 1인 일 답변 유사도 검사. 기본 40

  // ── 미디어(SFU) 일 상한 ───────────────────────────────────
  @IsOptional()
  @IsString()
  MEDIA_DAILY_TOKEN_LIMIT?: string;

  @IsOptional()
  @IsString()
  MEDIA_DAILY_RECORDING_LIMIT?: string;

  @IsOptional()
  @IsString()
  MEDIA_QUOTA_FAIL_OPEN?: string; // 'false' 면 장애 시 차단(기본은 통과 — 수업 중단 방지)

  @IsOptional()
  @IsString()
  STT_DAILY_LIMIT?: string; // 일 음성 전사 상한(유료 STT). 기본 60
}

/** 대시보드 권한 ENV 플래그 — 'true' 만 활성, 그 외/부재는 false(fail-closed). */
export const dashFlag = (v: string | undefined): boolean => v === 'true';

/**
 * 운영 환경 판정 — APP_ENV 우선, 없으면 NODE_ENV. 'prod'|'production' 만 운영.
 * fail-closed 보안 결정(웹훅 서명·시크릿 강도 등)이 이 함수로 로컬/운영을 가른다.
 */
export function isProdEnv(env: Record<string, unknown> = process.env): boolean {
  const v = (env.APP_ENV ?? env.NODE_ENV) as string | undefined;
  return v === 'prod' || v === 'production';
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
