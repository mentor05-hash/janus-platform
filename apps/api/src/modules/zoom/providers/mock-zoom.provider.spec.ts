import { MockZoomProvider } from './mock-zoom.provider';

describe('MockZoomProvider (§9·§10)', () => {
  const sut = new MockZoomProvider();

  it('예약 ID 기반 결정적 입장 URL 발급', async () => {
    const a = await sut.issueJoinUrl({
      bookingId: 'bk-1',
      startAt: null,
      endAt: null,
    });
    const b = await sut.issueJoinUrl({
      bookingId: 'bk-1',
      startAt: null,
      endAt: null,
    });
    expect(a.joinUrl).toBe('https://meet.local/itall/bk-1');
    expect(a.meetingId).toBe('bk-1');
    expect(a.joinUrl).toBe(b.joinUrl); // 결정적
  });
});
