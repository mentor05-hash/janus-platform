// API 응답 뷰 타입(백엔드 DTO와 일치). 전체 계약 타입은 @itall/shared(api-types) 에 생성됨.
export type BookingStatus = 'new' | 'confirmed' | 'done' | 'cancelled' | 'rejected' | 'noshow';

export interface Me {
  id: string;
  role: 'student' | 'teacher' | 'admin' | 'hr' | 'guardian';
  login_id: string;
  name: string;
  center_id: string | null;
  status: string;
  permLevel?: 'L1' | 'L2' | 'L3' | null;
  adminTier?: string | null; // 마스터 / 본사관리자 / 센터관리자
}

export interface Center {
  id: string;
  name: string;
  region: string | null;
}

export interface Booking {
  id: string;
  studentId: string;
  teacherId: string;
  consultType: string | null;
  subType: string | null;
  mode: string;
  sessionMode: string | null;
  direction: string;
  start: string | null;
  end: string | null;
  status: BookingStatus;
  chargedCredits: number;
}

export interface Slot {
  index: number;
  time: string;
  status: 'avail' | 'booked' | 'rest' | 'off' | 'blocked';
}

export interface WorkSchedule {
  recurring_template?: Record<string, { start: string; end: string }[]>;
  pre_book_horizon_days?: number;
}

export interface Payroll {
  teacherId: string;
  confirmedAmount: number;
  expectedAmount: number;
  incentive: number;
  breakdown: {
    doneCases: number;
    upcomingCases: number;
    qnaAccepted: number;
    perCaseRate: number;
    qnaRate: number;
    gradeAllowance: number;
    incentive: number;
  };
}

export interface HrStudent {
  id: string;
  login_id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface Dashboard {
  centerId: string | null;
  activeUsers: number;
  totalBookings: number;
  doneTotal: number;
  confirmedUpcoming: number;
  weeklyConsult: number;
  matchRate: number;
}

export interface PricingPolicy {
  id: string;
  center_id: string | null;
  mode: string;
  enabled: boolean;
  per_hour: number;
  surcharge_pct: number;
  board_item_fee: number | null;
  board_general_fee: number | null;
}

export interface LimitPolicy {
  center_id: string;
  reservation_limit: number | null;
  classify_fit_limit: number;
  classify_unfit_limit: number;
}

export interface PenaltyPolicy {
  cancel_threshold: number | null;
  noshow_threshold: number | null;
  reject_threshold: number | null;
  restrict_minutes: number | null;
  ranking_weight_down: number | null;
}

export interface FeatureRule {
  id: string;
  scope: string;
  center_id: string | null;
  target_type: string;
  target_value: string;
  enabled: boolean;
}

export interface ZoomPolicy {
  center_id: string;
  concurrent_limit: number;
}

export interface Room {
  id: string;
  type: string | null;
  capacity: number | null;
  operating_hours: string | null;
  setting: string | null;
  status: string | null;
}

export interface BlockedTime {
  id: string;
  type: string | null;
  start_at: string;
  end_at: string;
  scope: string | null;
}

export interface Report {
  id: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  status: string | null;
  action: string | null;
  ai_review: { flagged?: boolean; summary?: string; suggestedAction?: string } | null;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string | null;
  channels: string[];
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface ConsultationNote {
  bookingId: string;
  coreSummary: string | null;
  homework: string | null;
  futureDir: string | null;
  memo?: string | null;
  guardianVisible: boolean | null;
  saveState: 'draft' | 'final';
}
