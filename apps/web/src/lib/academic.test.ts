import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { acaMeta, acaDateLabel, acaDday, acaDdayLabel, groupByMonth } from './academic';

describe('acaMeta (유형 메타)', () => {
  it('알려진 유형은 라벨 매핑', () => {
    expect(acaMeta('suneung').label).toBe('수능');
    expect(acaMeta('mock_apply').label).toBe('모의고사 신청');
  });
  it('미지의 유형 → etc(기타)', () => {
    expect(acaMeta('zzz').label).toBe('기타');
  });
});

describe('acaDateLabel (단일일/기간)', () => {
  it('종료일 없으면 단일일', () => {
    expect(acaDateLabel({ start_date: '2026-11-19', end_date: null })).toBe('2026-11-19');
  });
  it('종료일 다르면 기간(시작 ~ 종료)', () => {
    expect(acaDateLabel({ start_date: '2026-08-10', end_date: '2026-08-21' })).toBe('2026-08-10 ~ 2026-08-21');
  });
  it('종료일==시작일이면 단일일', () => {
    expect(acaDateLabel({ start_date: '2026-08-10', end_date: '2026-08-10' })).toBe('2026-08-10');
  });
  it('ISO 타임스탬프도 앞 10자만 사용', () => {
    expect(acaDateLabel({ start_date: '2026-11-19T00:00:00.000Z', end_date: null })).toBe('2026-11-19');
  });
});

describe('acaDday / acaDdayLabel (오늘=2026-07-09 KST 고정)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-09T03:00:00Z')); }); // 12:00 KST
  afterEach(() => vi.useRealTimers());

  it('오늘 → 0 / D-DAY', () => {
    expect(acaDday('2026-07-09')).toBe(0);
    expect(acaDdayLabel({ start_date: '2026-07-09', end_date: null })).toBe('D-DAY');
  });
  it('미래 → 양수 / D-N', () => {
    expect(acaDday('2026-07-16')).toBe(7);
    expect(acaDdayLabel({ start_date: '2026-07-16', end_date: null })).toBe('D-7');
  });
  it('과거 → 음수 / D+N', () => {
    expect(acaDday('2026-07-07')).toBe(-2);
    expect(acaDdayLabel({ start_date: '2026-07-07', end_date: null })).toBe('D+2');
  });
  it('기간이 오늘을 포함하면 진행중', () => {
    expect(acaDdayLabel({ start_date: '2026-07-07', end_date: '2026-07-12' })).toBe('진행중');
  });
});

describe('groupByMonth (월별 그룹)', () => {
  it('YYYY-MM 기준으로 묶고 한국어 라벨', () => {
    const evs = [{ start_date: '2026-08-10' }, { start_date: '2026-08-21' }, { start_date: '2026-11-19' }];
    const g = groupByMonth(evs);
    expect(g.length).toBe(2);
    expect(g[0]).toMatchObject({ label: '2026년 8월' });
    expect(g[0].items.length).toBe(2);
    expect(g[1].label).toBe('2026년 11월');
  });
  it('빈 배열 → 빈 결과', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
