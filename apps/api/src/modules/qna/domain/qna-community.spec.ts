import { withinDailyLimit, canAnswerCommunity, shouldHide, aiUnlabeled } from './qna-community';

describe('Q3 커뮤니티 판정', () => {
  it('일 3건 제한', () => {
    expect(withinDailyLimit(0)).toBe(true);
    expect(withinDailyLimit(2)).toBe(true);
    expect(withinDailyLimit(3)).toBe(false);
  });

  it('전원 답변 게이트', () => {
    const base = { community: true, hidden: false, status: 'open', ownerId: 'o', userId: 'u' };
    expect(canAnswerCommunity(base).allowed).toBe(true); // 남이면 OK(학생 포함)
    expect(canAnswerCommunity({ ...base, userId: 'o' })).toEqual({ allowed: false, reason: 'owner' });
    expect(canAnswerCommunity({ ...base, community: false })).toEqual({ allowed: false, reason: 'not_community' });
    expect(canAnswerCommunity({ ...base, hidden: true })).toEqual({ allowed: false, reason: 'hidden' });
    expect(canAnswerCommunity({ ...base, status: 'resolved' })).toEqual({ allowed: false, reason: 'resolved' });
  });

  it('신고 누적 3건 → 숨김', () => {
    expect(shouldHide(2)).toBe(false);
    expect(shouldHide(3)).toBe(true);
  });

  it('AI 미표기 경고(유사도 0.8+)', () => {
    expect(aiUnlabeled(0.79)).toBe(false);
    expect(aiUnlabeled(0.8)).toBe(true);
  });
});
