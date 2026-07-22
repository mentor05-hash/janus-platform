/**
 * 과목별 커뮤니티 실적 집계(순수) — N33 "과목 오각형"(축 B)의 원천 신호.
 * 커뮤니티 답변(과목·채택여부)에서 과목별 답변수·채택수·채택률·리그등급을 산출한다.
 * 정책값 무관: 등급 임계는 기존 리그 정책(qna-league)을 그대로 재사용.
 * "미리 쌓기 시작"(무결정 선행) — 노출 게이트(n≥5)·타게팅은 N33 후속에서.
 */
import { evaluateLeague, DEFAULT_LEAGUE_POLICY, type LeaguePolicy } from './qna-league';

export const OTHER_SUBJECT = '기타';

export interface SubjectStat {
  subject: string; // 과목명(빈/누락은 '기타'로 합산)
  authored: number; // 답변 수
  accepted: number; // 채택 수
  acceptRate: number; // 채택률 %(0~100 정수)
  tier: number; // 과목별 리그 등급(3 기본 → 요건 충족 시 2·1)
}

/** 답변 배열 → 과목별 실적(채택수·답변수 내림차순, '기타'는 항상 끝). */
export function aggregateSubjectStats(
  rows: Array<{ subject: string | null | undefined; accepted: boolean }>,
  policy: LeaguePolicy = DEFAULT_LEAGUE_POLICY,
): SubjectStat[] {
  const m = new Map<string, { authored: number; accepted: number }>();
  for (const r of rows) {
    const s = (r.subject ?? '').trim() || OTHER_SUBJECT;
    const cur = m.get(s) ?? { authored: 0, accepted: 0 };
    cur.authored += 1;
    if (r.accepted) cur.accepted += 1;
    m.set(s, cur);
  }
  const out: SubjectStat[] = [];
  for (const [subject, c] of m) {
    const acceptRate = c.authored ? Math.round((c.accepted / c.authored) * 100) : 0;
    const tier = evaluateLeague({ authored: c.authored, accepted: c.accepted, acceptRate }, policy);
    out.push({ subject, authored: c.authored, accepted: c.accepted, acceptRate, tier });
  }
  out.sort((a, b) => {
    if (a.subject === OTHER_SUBJECT) return 1;
    if (b.subject === OTHER_SUBJECT) return -1;
    return b.accepted - a.accepted || b.authored - a.authored || a.subject.localeCompare(b.subject);
  });
  return out;
}
