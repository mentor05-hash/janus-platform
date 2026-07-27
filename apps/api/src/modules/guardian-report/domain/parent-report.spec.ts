import { buildParentReport, type ParentReportInput } from './parent-report';

const base: ParentReportInput = {
  studentName: '홍길동',
  periodDays: 7,
  score: { gye: '이과', mode: 'nb', nb: 1.53, period: '2026-06_모평' },
  sessions: { done: 3, upcoming: 1, noshow: 0, cancelled: 1 },
  consultations: [
    {
      at: '2026-07-13T00:00:00.000Z',
      teacher: '김선생',
      summary: '수학 오답 패턴 점검',
    },
  ],
  qnaCount: 2,
};

describe('buildParentReport (학부모 주간 통합 리포트 v1)', () => {
  it('출석률 = 완료/(완료+노쇼)', () => {
    expect(
      buildParentReport({
        ...base,
        sessions: { done: 3, upcoming: 0, noshow: 1, cancelled: 0 },
      }).sections.attendance.rate,
    ).toBe(75);
    expect(buildParentReport(base).sections.attendance.rate).toBe(100); // 노쇼 0
  });

  it('대상 세션(완료+노쇼) 0 이면 rate null·문구', () => {
    const r = buildParentReport({
      ...base,
      sessions: { done: 0, upcoming: 2, noshow: 0, cancelled: 0 },
    });
    expect(r.sections.attendance.rate).toBeNull();
    expect(r.sections.attendance.label).toContain('세션 없음');
  });

  it('헤드라인에 세션·상담·Q&A 요약', () => {
    const r = buildParentReport(base);
    expect(r.headline).toContain('홍길동');
    expect(r.headline).toContain('세션 3회 완료');
    expect(r.headline).toContain('상담 1건');
    expect(r.headline).toContain('Q&A 2건');
  });

  it('활동 전무 시 안내 문구', () => {
    const r = buildParentReport({
      studentName: '무활동',
      periodDays: 7,
      score: null,
      sessions: { done: 0, upcoming: 0, noshow: 0, cancelled: 0 },
      consultations: [],
      qnaCount: 0,
    });
    expect(r.headline).toContain('활동은 없었습니다');
    expect(r.sections.score).toBeNull();
  });

  it('상담 recent 는 최대 3건, 성적 라벨 생성', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      at: `2026-07-1${i}T00:00:00Z`,
      summary: `s${i}`,
    }));
    const r = buildParentReport({ ...base, consultations: many });
    expect(r.sections.consultation.count).toBe(5);
    expect(r.sections.consultation.recent.length).toBe(3);
    expect(r.sections.score?.label).toContain('전국누백 1.53%');
  });

  it('kind/version 고정 + 민감기록 제외 고지', () => {
    const r = buildParentReport(base);
    expect(r.kind).toBe('parent_weekly');
    expect(r.version).toBe('v1');
    expect(r.disclaimer).toContain('심리·민감 상담 기록은 포함되지 않습니다');
  });
});
