/**
 * Q3 커뮤니티 판정(순수) — 무료 게시판의 답변 권한·신고 숨김·AI 미표기 경고 규칙.
 * 상태(카운터·DB)는 서비스가, 규칙은 여기서(테스트 용이).
 */
export const COMMUNITY_DAILY_LIMIT = 3; // 학생 1인당 하루 커뮤니티 질문 수
export const REPORT_HIDE_THRESHOLD = 3; // 신고 누적 시 자동 숨김
export const AI_SIMILAR_THRESHOLD = 0.8; // AI 초안과 이 이상 유사하면 미표기 경고

export const withinDailyLimit = (usedToday: number, limit = COMMUNITY_DAILY_LIMIT): boolean => usedToday < limit;

export type AnswerGate = { allowed: true } | { allowed: false; reason: 'not_community' | 'hidden' | 'resolved' | 'owner' };

/** 커뮤니티 답변 가능 여부 — 커뮤니티 질문·미숨김·미해결·본인 질문 아님이면 누구나(전원 답변). */
export function canAnswerCommunity(p: { community: boolean; hidden: boolean; status: string; ownerId: string; userId: string }): AnswerGate {
  if (!p.community) return { allowed: false, reason: 'not_community' };
  if (p.hidden) return { allowed: false, reason: 'hidden' };
  if (p.status !== 'open') return { allowed: false, reason: 'resolved' };
  if (p.ownerId === p.userId) return { allowed: false, reason: 'owner' };
  return { allowed: true };
}

export const shouldHide = (reportCount: number, threshold = REPORT_HIDE_THRESHOLD): boolean => reportCount >= threshold;

/** AI 초안과 유사도가 임계 이상이면 "AI 생성 미표기" 경고(사람이 초안을 그대로 붙인 정황). */
export const aiUnlabeled = (similarityToDraft: number, threshold = AI_SIMILAR_THRESHOLD): boolean => similarityToDraft >= threshold;
