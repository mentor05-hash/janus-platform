/**
 * 학부모 주간 통합 리포트 v1 (실행계획서 W8·사업기획서 §3 — "리포트는 야누스에서만 생성됨").
 * 순수 도메인: 성적(janus_score)·세션(출석)·상담기록·Q&A 활동 집계 → 한 화면 요약.
 * DB 수집은 서비스가 하고, 여기서는 조립·요약 문구만(테스트 용이).
 */

export interface ParentReportScore {
  gye: '이과' | '문과' | null;
  mode: 'std' | 'nb';
  nb?: number;
  period: string;
}
export interface ParentReportSessions {
  done: number; // 완료(출석)
  upcoming: number; // 예정(confirmed/new)
  noshow: number; // 노쇼
  cancelled: number; // 취소
}
export interface ParentReportConsult {
  at: string; // ISO
  teacher?: string;
  summary: string | null;
}
export interface ParentReportInput {
  studentName: string;
  periodDays: number;
  score: ParentReportScore | null;
  sessions: ParentReportSessions;
  consultations: ParentReportConsult[];
  qnaCount: number;
}

export interface ParentReport {
  kind: 'parent_weekly';
  version: 'v1';
  student: { name: string };
  period: { days: number };
  headline: string;
  sections: {
    score: (ParentReportScore & { label: string }) | null;
    attendance: { done: number; upcoming: number; noshow: number; cancelled: number; rate: number | null; label: string };
    consultation: { count: number; recent: ParentReportConsult[] };
    qna: { count: number };
  };
  disclaimer: string;
}

/** 출석률 = 완료 / (완료+노쇼). 대상 세션(완료+노쇼) 0 이면 null. */
function attendanceRate(s: ParentReportSessions): number | null {
  const denom = s.done + s.noshow;
  return denom === 0 ? null : Math.round((s.done / denom) * 100);
}

export function buildParentReport(input: ParentReportInput): ParentReport {
  const { studentName, periodDays, score, sessions, consultations, qnaCount } = input;
  const rate = attendanceRate(sessions);

  const scoreLabel = !score
    ? '성적 미연동'
    : score.mode === 'nb' && score.nb != null
      ? `전국누백 ${score.nb}% · ${score.gye ?? '계열 미상'}`
      : `표점 입력 · ${score.gye ?? '계열 미상'}`;

  const attLabel =
    rate == null ? '이번 주 진행된 세션 없음' : rate === 100 ? `출석 ${rate}% — 개근` : `출석 ${rate}%${sessions.noshow ? ` · 노쇼 ${sessions.noshow}회` : ''}`;

  const parts: string[] = [];
  if (sessions.done) parts.push(`세션 ${sessions.done}회 완료`);
  if (rate != null && rate < 100) parts.push(`출석 ${rate}%`);
  if (consultations.length) parts.push(`상담 ${consultations.length}건`);
  if (qnaCount) parts.push(`Q&A ${qnaCount}건`);
  if (sessions.upcoming) parts.push(`예정 ${sessions.upcoming}회`);
  const headline =
    parts.length === 0
      ? `이번 주 ${studentName} 학생의 플랫폼 활동은 없었습니다.`
      : `이번 주 ${studentName} 학생: ${parts.join(' · ')}.`;

  return {
    kind: 'parent_weekly',
    version: 'v1',
    student: { name: studentName },
    period: { days: periodDays },
    headline,
    sections: {
      score: score ? { ...score, label: scoreLabel } : null,
      attendance: { ...sessions, rate, label: attLabel },
      consultation: { count: consultations.length, recent: consultations.slice(0, 3) },
      qna: { count: qnaCount },
    },
    disclaimer: '본 리포트는 자녀의 야누스 활동 요약이며, 성적 수치는 지난 입시 데이터 기반 추정입니다. 심리·민감 상담 기록은 포함되지 않습니다.',
  };
}
