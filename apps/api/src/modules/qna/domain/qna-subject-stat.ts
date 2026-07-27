/**
 * 과목별 커뮤니티 실적 집계(순수) — N33 "과목 오각형"(축 B)의 원천 신호.
 * 커뮤니티 답변(과목·채택여부)에서 과목별 답변수·채택수·채택률·리그등급을 산출한다.
 * 과목명은 canonical 정규화(㉚)로 접어 파편화를 막는다('수학'·'미적분' 통합).
 * 노출 게이트(㉙): 과목별 authored ≥ 리그 minAuthored(=5)일 때만 visible=true(과목 오각형 표시 자격).
 */
import {
  evaluateLeague,
  DEFAULT_LEAGUE_POLICY,
  type LeaguePolicy,
} from './qna-league';
import { normalizeSubject } from './qna-subject-canonical';

export const OTHER_SUBJECT = '기타';

export interface SubjectStat {
  subject: string; // 과목명(canonical 정규화·빈/누락은 '기타'로 합산)
  authored: number; // 답변 수
  accepted: number; // 채택 수
  acceptRate: number; // 채택률 %(0~100 정수)
  tier: number; // 과목별 리그 등급(3 기본 → 요건 충족 시 2·1)
  visible: boolean; // 노출 게이트(㉙): 표본 충족(authored≥minAuthored) 시에만 오각형 표시 자격
}

/** 답변 배열 → 과목별 실적(채택수·답변수 내림차순, '기타'는 항상 끝). */
export function aggregateSubjectStats(
  rows: Array<{ subject: string | null | undefined; accepted: boolean }>,
  policy: LeaguePolicy = DEFAULT_LEAGUE_POLICY,
): SubjectStat[] {
  const m = new Map<string, { authored: number; accepted: number }>();
  for (const r of rows) {
    const s = normalizeSubject(r.subject) || OTHER_SUBJECT;
    const cur = m.get(s) ?? { authored: 0, accepted: 0 };
    cur.authored += 1;
    if (r.accepted) cur.accepted += 1;
    m.set(s, cur);
  }
  const out: SubjectStat[] = [];
  for (const [subject, c] of m) {
    const acceptRate = c.authored
      ? Math.round((c.accepted / c.authored) * 100)
      : 0;
    const tier = evaluateLeague(
      { authored: c.authored, accepted: c.accepted, acceptRate },
      policy,
    );
    const visible = c.authored >= policy.promote2.minAuthored;
    out.push({
      subject,
      authored: c.authored,
      accepted: c.accepted,
      acceptRate,
      tier,
      visible,
    });
  }
  out.sort((a, b) => {
    if (a.subject === OTHER_SUBJECT) return 1;
    if (b.subject === OTHER_SUBJECT) return -1;
    return (
      b.accepted - a.accepted ||
      b.authored - a.authored ||
      a.subject.localeCompare(b.subject)
    );
  });
  return out;
}
