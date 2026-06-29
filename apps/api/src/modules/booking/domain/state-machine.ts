import { BookingStatus } from '../../../config/enums';

/**
 * 예약 상태머신 (CLAUDE.md §5-4).
 * new → confirmed → done, 그리고 cancelled/rejected/noshow 종료 상태.
 * 역상담(reverse)도 동일 상태 흐름(첫 상담 한정 옵션)을 따른다.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.NEW]: [BookingStatus.CONFIRMED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.DONE, BookingStatus.CANCELLED, BookingStatus.NOSHOW],
  [BookingStatus.DONE]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.REJECTED]: [],
  [BookingStatus.NOSHOW]: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

/** 취소 시 크레딧 환원 대상 상태(자리를 점유했던 경우). */
export function shouldRefundOnTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (to === BookingStatus.CANCELLED || to === BookingStatus.REJECTED) {
    return from === BookingStatus.NEW || from === BookingStatus.CONFIRMED;
  }
  return false;
}
