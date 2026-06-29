// API 응답 뷰 타입(백엔드 DTO와 일치). 전체 계약 타입은 @itall/shared(api-types) 에 생성됨.
export type BookingStatus = 'new' | 'confirmed' | 'done' | 'cancelled' | 'rejected' | 'noshow';

export interface Me {
  id: string;
  role: 'student' | 'teacher' | 'admin' | 'hr' | 'guardian';
  login_id: string;
  name: string;
  center_id: string | null;
  status: string;
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

export interface ConsultationNote {
  bookingId: string;
  coreSummary: string | null;
  homework: string | null;
  futureDir: string | null;
  memo?: string | null;
  guardianVisible: boolean | null;
  saveState: 'draft' | 'final';
}
