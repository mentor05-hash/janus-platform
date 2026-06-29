import { canReportTransition } from './report';

describe('신고 상태머신(§6 Phase 3)', () => {
  it('정상 전이', () => {
    expect(canReportTransition('received', 'reviewing')).toBe(true);
    expect(canReportTransition('received', 'resolved')).toBe(true);
    expect(canReportTransition('reviewing', 'dismissed')).toBe(true);
  });
  it('종료 상태에서 전이 불가', () => {
    expect(canReportTransition('resolved', 'reviewing')).toBe(false);
    expect(canReportTransition('dismissed', 'received')).toBe(false);
  });
});
