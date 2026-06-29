/**
 * API(한글 ENUM 값) ↔ Prisma 클라이언트(영문 멤버명) 매핑.
 * DB는 한글로 저장(@map)되지만 Prisma 클라이언트는 영문 멤버명을 사용하므로,
 * 컨트롤러/DTO 의 한글 값을 Prisma 호출 전/후로 변환한다. (CLAUDE.md §7)
 */
import { ConsultType, SessionMode } from './enums';

// consult_type: '담임' ↔ 'homeroom' …
const CONSULT_TO_PRISMA = {
  [ConsultType.HOMEROOM]: 'homeroom',
  [ConsultType.SUBJECT]: 'subject',
  [ConsultType.ADMISSION]: 'admission',
  [ConsultType.PSYCH]: 'psych',
} as const;
const CONSULT_FROM_PRISMA: Record<string, ConsultType> = Object.fromEntries(
  Object.entries(CONSULT_TO_PRISMA).map(([k, v]) => [v, k as ConsultType]),
);

// session_mode: '상담' ↔ 'consult', '질문' ↔ 'question'
const SESSION_TO_PRISMA = {
  [SessionMode.CONSULT]: 'consult',
  [SessionMode.QUESTION]: 'question',
} as const;
const SESSION_FROM_PRISMA: Record<string, SessionMode> = Object.fromEntries(
  Object.entries(SESSION_TO_PRISMA).map(([k, v]) => [v, k as SessionMode]),
);

export const consultTypeToPrisma = (v: ConsultType) => CONSULT_TO_PRISMA[v];
export const consultTypeFromPrisma = (v: string | null): ConsultType | null =>
  v == null ? null : (CONSULT_FROM_PRISMA[v] ?? null);

export const sessionModeToPrisma = (v: SessionMode) => SESSION_TO_PRISMA[v];
export const sessionModeFromPrisma = (v: string | null): SessionMode | null =>
  v == null ? null : (SESSION_FROM_PRISMA[v] ?? null);
