import { BookingStatus } from '../../../config/enums';
import { canTransition, shouldRefundOnTransition } from './state-machine';

/** §5-4 예약 상태머신 전이 규칙. */
describe('예약 상태머신(§5-4)', () => {
  it('정상 전이: new→confirmed→done', () => {
    expect(canTransition(BookingStatus.NEW, BookingStatus.CONFIRMED)).toBe(
      true,
    );
    expect(canTransition(BookingStatus.CONFIRMED, BookingStatus.DONE)).toBe(
      true,
    );
  });

  it('취소/거절/노쇼 전이', () => {
    expect(canTransition(BookingStatus.NEW, BookingStatus.REJECTED)).toBe(true);
    expect(
      canTransition(BookingStatus.CONFIRMED, BookingStatus.CANCELLED),
    ).toBe(true);
    expect(canTransition(BookingStatus.CONFIRMED, BookingStatus.NOSHOW)).toBe(
      true,
    );
  });

  it('잘못된 전이 차단', () => {
    expect(canTransition(BookingStatus.NEW, BookingStatus.DONE)).toBe(false); // 확정 없이 완료 불가
    expect(canTransition(BookingStatus.DONE, BookingStatus.CONFIRMED)).toBe(
      false,
    ); // 종료 상태
    expect(canTransition(BookingStatus.CANCELLED, BookingStatus.NEW)).toBe(
      false,
    );
  });

  it('취소/거절 시 크레딧 환원 대상', () => {
    expect(
      shouldRefundOnTransition(BookingStatus.NEW, BookingStatus.CANCELLED),
    ).toBe(true);
    expect(
      shouldRefundOnTransition(BookingStatus.CONFIRMED, BookingStatus.REJECTED),
    ).toBe(true);
    expect(
      shouldRefundOnTransition(BookingStatus.CONFIRMED, BookingStatus.DONE),
    ).toBe(false);
  });
});
