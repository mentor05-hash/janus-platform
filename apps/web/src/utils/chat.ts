/** 채팅 좌/우 정렬 판정(순수). 서버가 계산한 mine(boolean) 을 신뢰, 없을 때만 myId 폴백. */
export function mineOf(m: { mine?: boolean; senderId: string | null }, myId: string): boolean {
  return typeof m.mine === 'boolean' ? m.mine : m.senderId === myId;
}
