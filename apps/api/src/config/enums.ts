/**
 * DB ENUM ↔ TS 상수 동기화 (CLAUDE.md §7).
 * 근거: migrations/0001_init.sql 의 CREATE TYPE 정의.
 * 한글 ENUM(consult_type, session_mode)은 DB 값 그대로 사용 — 표시 라벨은 별도 매핑 가능.
 */

export const AccountRole = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin',
  HR: 'hr',
  GUARDIAN: 'guardian',
} as const;
export type AccountRole = (typeof AccountRole)[keyof typeof AccountRole];

export const AccountStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  INACTIVE: 'inactive',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const PermLevel = { L1: 'L1', L2: 'L2', L3: 'L3' } as const;
export type PermLevel = (typeof PermLevel)[keyof typeof PermLevel];

export const TeacherGrade = { S: 'S', A: 'A', B: 'B' } as const;
export type TeacherGrade = (typeof TeacherGrade)[keyof typeof TeacherGrade];

export const ConsultType = {
  HOMEROOM: '담임',
  SUBJECT: '교과',
  ADMISSION: '입시',
  PSYCH: '심리',
} as const;
export type ConsultType = (typeof ConsultType)[keyof typeof ConsultType];

export const ConsultMode = {
  BOARD: 'board',
  CHAT: 'chat',
  ZOOM: 'zoom',
  HAND: 'hand',
  OFFLINE: 'offline',
} as const;
export type ConsultMode = (typeof ConsultMode)[keyof typeof ConsultMode];

export const SessionMode = { CONSULT: '상담', QUESTION: '질문' } as const;
export type SessionMode = (typeof SessionMode)[keyof typeof SessionMode];

export const BookingDir = { STUDENT: 'student', REVERSE: 'reverse' } as const;
export type BookingDir = (typeof BookingDir)[keyof typeof BookingDir];

export const BookingStatus = {
  NEW: 'new',
  CONFIRMED: 'confirmed',
  DONE: 'done',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  NOSHOW: 'noshow',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const NoteSaveState = { DRAFT: 'draft', FINAL: 'final' } as const;
export type NoteSaveState = (typeof NoteSaveState)[keyof typeof NoteSaveState];

export const BoardQType = { ITEM: 'item', GENERAL: 'general' } as const;
export type BoardQType = (typeof BoardQType)[keyof typeof BoardQType];

export const BoardScope = { ASSIGNED: 'assigned', OPEN: 'open' } as const;
export type BoardScope = (typeof BoardScope)[keyof typeof BoardScope];

export const BillingCycle = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
} as const;
export type BillingCycle = (typeof BillingCycle)[keyof typeof BillingCycle];

export const PayerType = { GUARDIAN: 'guardian', STUDENT: 'student' } as const;
export type PayerType = (typeof PayerType)[keyof typeof PayerType];

export const CreditTxnType = {
  CHARGE: 'charge',
  SPEND: 'spend',
  WEEKLY_GRANT: 'weekly_grant',
  WEEKLY_EXPIRE: 'weekly_expire',
  REFUND: 'refund',
} as const;
export type CreditTxnType = (typeof CreditTxnType)[keyof typeof CreditTxnType];

export const PayReqStatus = {
  OPEN: 'open',
  DONE: 'done',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const;
export type PayReqStatus = (typeof PayReqStatus)[keyof typeof PayReqStatus];

export const PayReqOrigin = { MANUAL: 'manual', AUTO: 'auto' } as const;
export type PayReqOrigin = (typeof PayReqOrigin)[keyof typeof PayReqOrigin];

export const ListKind = { FIT: 'fit', UNFIT: 'unfit' } as const;
export type ListKind = (typeof ListKind)[keyof typeof ListKind];

export const CancelRoute = {
  SUBSTITUTE: 'substitute',
  PRIORITY: 'priority',
  ADMIN_MANUAL: 'admin_manual',
  REBOOK_NOTICE: 'rebook_notice',
} as const;
export type CancelRoute = (typeof CancelRoute)[keyof typeof CancelRoute];
