/**
 * 크레딧 부족 신호 — 트랜잭션 롤백 후 결제요청 생성 + 402 변환에 사용.
 * (booking·qna 등에서 공유; 중복 정의 제거)
 */
export class ShortfallError extends Error {
  constructor(public readonly shortfall: number) {
    super('INSUFFICIENT_CREDITS');
    this.name = 'ShortfallError';
  }
}
