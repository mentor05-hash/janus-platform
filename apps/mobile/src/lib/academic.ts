/** 학사일정 공용 타입·표시 헬퍼(모바일 — 웹 lib/academic 정렬). */
export type AcademicEvent = {
  id: string;
  center_id: string | null;
  title: string;
  type: string;
  start_date: string;
  end_date: string | null;
  grade: string | null;
  description: string | null;
};

export const ACA_META: Record<string, { label: string; icon: string; color: string }> = {
  suneung: { label: '수능', icon: '🎓', color: '#d06b52' },
  mock: { label: '모의고사', icon: '📝', color: '#2F6FB3' },
  mock_apply: { label: '모의고사 신청', icon: '🗒️', color: '#CF9A3A' },
  exam: { label: '내신·시험', icon: '✏️', color: '#57a86a' },
  admission: { label: '입시·원서', icon: '📮', color: '#7A5AF8' },
  school: { label: '학사', icon: '🏫', color: '#64748B' },
  etc: { label: '기타', icon: '📌', color: '#64748B' },
};
export const acaMeta = (t: string) => ACA_META[t] ?? ACA_META.etc;

const d10 = (s: string) => s.slice(0, 10);

export function acaDateLabel(e: { start_date: string; end_date: string | null }): string {
  const s = d10(e.start_date);
  return e.end_date && d10(e.end_date) !== s ? `${s} ~ ${d10(e.end_date)}` : s;
}

export function acaDday(start: string): number {
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
  const d = new Date(d10(start));
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function acaDdayLabel(e: { start_date: string; end_date: string | null }): string {
  const s = acaDday(e.start_date);
  const end = e.end_date ? acaDday(e.end_date) : s;
  if (s <= 0 && end >= 0) return e.end_date && end !== s ? '진행중' : 'D-DAY';
  if (s > 0) return `D-${s}`;
  return `D+${Math.abs(s)}`;
}
