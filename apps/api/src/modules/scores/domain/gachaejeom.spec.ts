import {
  assertUsableTable,
  convertRaw,
  DEFAULT_DISCLAIMER,
  GachaejeomError,
  lookup,
} from './gachaejeom';
import type { GachaejeomTable } from './gachaejeom';

/** 합성 표 — 원점수 0~100 을 표준점수 60~150 · 백분위 0~100 으로 선형 대응. */
const rel = (corrected = true) => ({
  type: 'relative' as const,
  max_raw: 100,
  corrected,
  raw_to_std: Array.from(
    { length: 101 },
    (_, r) => [r, 60 + r * 0.9] as [number, number],
  ),
  raw_to_pct: Array.from({ length: 101 }, (_, r) => [r, r] as [number, number]),
});

const abs = () => ({
  type: 'absolute' as const,
  max_raw: 100,
  raw_to_grade: Array.from(
    { length: 101 },
    (_, r) =>
      [r, r >= 90 ? 1 : r >= 80 ? 2 : r >= 70 ? 3 : 4] as [number, number],
  ),
});

const table = (over: Partial<GachaejeomTable> = {}): GachaejeomTable => ({
  schema: 1,
  mode: 'gachaejeom',
  disclaimer: DEFAULT_DISCLAIMER,
  subjects: {
    kor: rel(),
    mat: rel(),
    tam1: rel(),
    tam2: rel(),
    eng: abs(),
    han: abs(),
  },
  ...over,
});

describe('lookup (구간선형·clamp)', () => {
  const pts: Array<[number, number]> = [
    [0, 0],
    [10, 100],
  ];
  it('중간은 선형 보간', () => expect(lookup(pts, 5)).toBe(50));
  it('범위 밖은 양끝 고정 — 원점수는 닫힌 구간이라 외삽할 자리가 없다', () => {
    expect(lookup(pts, -3)).toBe(0);
    expect(lookup(pts, 999)).toBe(100);
  });
  it('빈 표는 던진다', () =>
    expect(() => lookup([], 1)).toThrow(GachaejeomError));
});

describe('assertUsableTable — 조용히 넘어가지 않는다', () => {
  it('subjects 없음', () =>
    expect(() => assertUsableTable({})).toThrow(/subjects/));
  it('상대평가 과목 누락을 이름으로 지목', () => {
    const t = table();
    delete (t.subjects as Record<string, unknown>).tam2;
    expect(() => assertUsableTable(t)).toThrow(/tam2/);
  });
  it('raw_to_std 가 비면 던진다', () => {
    const t = table();
    t.subjects.kor.raw_to_std = [];
    expect(() => assertUsableTable(t)).toThrow(/raw_to_std/);
  });
});

describe('convertRaw — 원점수 → 추정 표준점수', () => {
  it('상대평가 4종이 차면 complete', () => {
    const c = convertRaw(table(), { kor: 90, mat: 80, tam1: 70, tam2: 60 });
    expect(c.complete).toBe(true);
    expect(c.subjects.kor).toEqual({ raw: 90, std: 141, pct: 90 });
    expect(c.subjects.mat!.std).toBe(132);
  });

  it('부분 입력은 허용하되 complete=false — 탐구 한 과목만 먼저 채점하는 경우', () => {
    const c = convertRaw(table(), { kor: 90, mat: 80 });
    expect(c.complete).toBe(false);
    expect(c.subjects.tam1).toBeUndefined();
  });

  it('절대평가는 계단 함수 — 보간해서 2.5등급을 만들지 않는다', () => {
    const c = convertRaw(table(), { eng: 89, han: 90 });
    expect(c.subjects.eng!.grade).toBe(2);
    expect(c.subjects.han!.grade).toBe(1);
    expect(c.subjects.eng!.std).toBeUndefined();
  });

  it('원점수를 버리지 않는다 — 실채점 도착 시 재환산해야 한다', () => {
    const c = convertRaw(table(), { kor: 77 });
    expect(c.subjects.kor!.raw).toBe(77);
  });

  it('면책은 표에서 가져오고, 없으면 기본값', () => {
    expect(convertRaw(table(), { kor: 1 }).disclaimer).toBe(DEFAULT_DISCLAIMER);
    const t = table();
    delete t.disclaimer;
    expect(convertRaw(t, { kor: 1 }).disclaimer).toBe(DEFAULT_DISCLAIMER);
  });

  it('무보정 과목을 알린다 — 화면이 함께 고지해야 한다', () => {
    const t = table();
    t.subjects.mat = rel(false);
    expect(convertRaw(t, { kor: 90, mat: 90 }).uncorrected).toEqual(['mat']);
  });

  it('범위 밖 원점수는 과목명과 함께 던진다', () => {
    expect(() => convertRaw(table(), { kor: 140 })).toThrow(/kor/);
    expect(() => convertRaw(table(), { mat: -1 })).toThrow(/범위/);
  });

  it('숫자가 아니면 던진다', () =>
    expect(() => convertRaw(table(), { kor: Number.NaN })).toThrow(
      GachaejeomError,
    ));

  it('절대평가 표에 raw_to_grade 가 없으면 던진다', () => {
    const t = table();
    t.subjects.eng.raw_to_grade = [];
    expect(() => convertRaw(t, { eng: 90 })).toThrow(/raw_to_grade/);
  });
});
