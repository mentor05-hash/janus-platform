import { describe, it, expect } from 'vitest';
import { mineOf } from './chat';

describe('mineOf — 채팅 좌/우 정렬(회귀 가드)', () => {
  const myId = 'me-123';

  it('서버 mine=true 이면 senderId 와 무관하게 내 메시지(우)', () => {
    expect(mineOf({ mine: true, senderId: 'other-999' }, myId)).toBe(true);
  });
  it('서버 mine=false 이면 상대 메시지(좌)', () => {
    expect(mineOf({ mine: false, senderId: myId }, myId)).toBe(false);
  });
  it('서버 mine 미포함 시 senderId===myId 로 판정(폴백)', () => {
    expect(mineOf({ senderId: myId }, myId)).toBe(true);
    expect(mineOf({ senderId: 'other' }, myId)).toBe(false);
  });
  it('senderId 가 null 이고 myId 도 빈 값이어도 전부 우측이 되지 않는다', () => {
    // 과거 버그: undefined===undefined 로 전부 우측 → mine 우선/명시 비교로 방지
    expect(mineOf({ senderId: null }, '')).toBe(false);
  });
});
