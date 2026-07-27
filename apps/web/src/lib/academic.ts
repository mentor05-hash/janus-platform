/** 학사일정 공용 타입·표시 헬퍼(관리자·학생 화면 공유). */
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

export const ACA_TYPES = ['suneung', 'mock', 'mock_apply', 'exam', 'admission', 'school', 'etc'] as const;

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

/** 기간이면 "시작 ~ 종료", 단일일이면 시작일. */
export function acaDateLabel(e: { start_date: string; end_date: string | null }): string {
  const s = d10(e.start_date);
  return e.end_date && d10(e.end_date) !== s ? `${s} ~ ${d10(e.end_date)}` : s;
}

/** 오늘(KST) 기준 D-day. 0=오늘, 양수=남은 일수, 음수=지남. */
export function acaDday(start: string): number {
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
  const d = new Date(d10(start));
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/** D-day 라벨(단일일 기준). 기간 진행 중이면 진행중. */
export function acaDdayLabel(e: { start_date: string; end_date: string | null }): string {
  const s = acaDday(e.start_date);
  const end = e.end_date ? acaDday(e.end_date) : s;
  if (s <= 0 && end >= 0) return e.end_date && end !== s ? '진행중' : 'D-DAY';
  if (s > 0) return `D-${s}`;
  return `D+${Math.abs(s)}`;
}

/** YYYY-MM 키로 그룹핑(정렬된 배열 → 유지). */
export function groupByMonth<T extends { start_date: string }>(events: T[]): { key: string; label: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const e of events) {
    const k = d10(e.start_date).slice(0, 7);
    (map.get(k) ?? map.set(k, []).get(k)!).push(e);
  }
  return [...map.entries()].map(([key, items]) => {
    const [y, m] = key.split('-');
    return { key, label: `${y}년 ${Number(m)}월`, items };
  });
}
