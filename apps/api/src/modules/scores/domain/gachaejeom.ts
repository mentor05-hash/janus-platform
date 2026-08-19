/**
 * 가채점 환산(순수) — 원점수 → 추정 표준점수·백분위·등급.
 *
 * 표는 `ops/placement/gachaejeom_convert.py`(N4-P2)가 만든 산출물이다. 이 모듈은 **읽기만** 한다 —
 * 환산 방법론(등급컷 앵커·구간선형)은 P2 소관이고, 여기서는 이미 만들어진 표를 조회할 뿐이다.
 * 방법론을 두 곳에 두면 갈라진다.
 *
 * 계약(C1·O43 하위호환 확장): 가채점으로 만든 점수는 `janus_score.est = 'gachaejeom'` 을 달고 나간다.
 * 이 필드가 **없으면 기존과 동일**(실채점·일반)이므로 모르는 소비자는 영향을 받지 않는다.
 * 배치표·리포트는 이 값을 보고 면책 문구를 함께 낸다 — 추정치를 실측처럼 보이게 두지 않는다.
 *
 * 표의 과목 키는 janus_score 키(kor·mat·tam1·tam2·eng·han)를 그대로 쓴다. 이름을 두 벌로
 * 유지하면 매핑이 어긋나는 날이 온다.
 */

/** P2 산출물 — 필요한 부분만. 표 자체는 JANUS_DATA_DIR 로컬 전용(repo 반입 금지). */
export interface GachaejeomTable {
  schema?: number;
  mode?: string;
  base_year?: number;
  target_year?: number;
  difficulty_source?: string;
  disclaimer?: string;
  subjects: Record<string, GachaejeomSubject>;
}

export interface GachaejeomSubject {
  type: 'relative' | 'absolute';
  max_raw?: number;
  corrected?: boolean;
  caveat?: string;
  raw_to_std?: Array<[number, number]>;
  raw_to_pct?: Array<[number, number]>;
  raw_to_grade?: Array<[number, number]>;
}

/** 상대평가 4종 — 표점이 전부 있어야 janus_score 가 std 모드로 나간다(C1). */
export const RELATIVE_KEYS = ['kor', 'mat', 'tam1', 'tam2'] as const;
/** 절대평가 2종 — 등급만. */
export const ABSOLUTE_KEYS = ['eng', 'han'] as const;

export type RelativeKey = (typeof RELATIVE_KEYS)[number];
export type AbsoluteKey = (typeof ABSOLUTE_KEYS)[number];
export type SubjectKey = RelativeKey | AbsoluteKey;

export interface RawInput {
  kor?: number | null;
  mat?: number | null;
  tam1?: number | null;
  tam2?: number | null;
  eng?: number | null;
  han?: number | null;
}

export interface ConvertedSubject {
  raw: number;
  std?: number;
  pct?: number;
  grade?: number;
}

export interface ConvertedScores {
  subjects: Partial<Record<SubjectKey, ConvertedSubject>>;
  /** 상대평가 4종이 모두 환산됐는가 — janus_score std 모드의 전제. */
  complete: boolean;
  disclaimer: string;
  /** 난이도 보정이 없는 과목(표의 caveat) — 화면에서 함께 알린다. */
  uncorrected: SubjectKey[];
}

export class GachaejeomError extends Error {}

export const DEFAULT_DISCLAIMER =
  '가채점 기반 추정치입니다. 실채점 결과와 차이가 있을 수 있습니다.';

/** 표가 우리가 쓸 수 있는 모양인지 확인. 아니면 **조용히 넘어가지 않고** 던진다. */
export function assertUsableTable(
  table: unknown,
): asserts table is GachaejeomTable {
  if (!table || typeof table !== 'object') {
    throw new GachaejeomError('환산표가 객체가 아닙니다.');
  }
  const t = table as GachaejeomTable;
  if (!t.subjects || typeof t.subjects !== 'object') {
    throw new GachaejeomError('환산표에 subjects 가 없습니다.');
  }
  const missing = RELATIVE_KEYS.filter((k) => !t.subjects[k]);
  if (missing.length) {
    throw new GachaejeomError(
      `환산표에 상대평가 과목이 없습니다: ${missing.join(', ')} (필요: ${RELATIVE_KEYS.join(', ')})`,
    );
  }
  for (const k of RELATIVE_KEYS) {
    const s = t.subjects[k];
    if (!Array.isArray(s.raw_to_std) || s.raw_to_std.length < 2) {
      throw new GachaejeomError(
        `환산표 ${k}: raw_to_std 가 없거나 점이 2개 미만입니다.`,
      );
    }
  }
}

/** 구간선형 조회. 표 밖은 양끝 고정(원점수는 닫힌 구간이라 외삽할 자리가 없다). */
export function lookup(points: Array<[number, number]>, raw: number): number {
  if (!points.length) throw new GachaejeomError('조회할 점이 없습니다.');
  if (raw <= points[0][0]) return points[0][1];
  if (raw >= points[points.length - 1][0]) return points[points.length - 1][1];
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= raw) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = points[lo];
  const [x1, y1] = points[hi];
  if (x1 === x0) return y0;
  return y0 + ((y1 - y0) * (raw - x0)) / (x1 - x0);
}

function rawOf(
  v: number | null | undefined,
  key: string,
  maxRaw: number,
): number | null {
  if (v == null) return null;
  if (!Number.isFinite(v))
    throw new GachaejeomError(`${key}: 원점수가 숫자가 아닙니다.`);
  if (v < 0 || v > maxRaw) {
    throw new GachaejeomError(
      `${key}: 원점수 ${v} 가 범위[0, ${maxRaw}] 밖입니다.`,
    );
  }
  return v;
}

/**
 * 원점수 → 추정 표준점수·백분위·등급.
 *
 * 부분 입력을 허용한다(수능 당일 탐구 1과목만 먼저 채점하는 경우가 있다). 다만 상대평가 4종이
 * 다 차야 `complete` 가 되고, 그때만 janus_score 가 std 모드로 나간다 — C1 의 "표점 4종 또는 nb 택1".
 */
export function convertRaw(
  table: GachaejeomTable,
  input: RawInput,
): ConvertedScores {
  assertUsableTable(table);
  const out: Partial<Record<SubjectKey, ConvertedSubject>> = {};
  const uncorrected: SubjectKey[] = [];

  for (const k of RELATIVE_KEYS) {
    const sub = table.subjects[k];
    const raw = rawOf(input[k], k, sub.max_raw ?? 100);
    if (raw == null) continue;
    const std = Math.round(lookup(sub.raw_to_std!, raw));
    const pct = sub.raw_to_pct
      ? Math.round(lookup(sub.raw_to_pct, raw) * 10) / 10
      : undefined;
    out[k] = { raw, std, ...(pct == null ? {} : { pct }) };
    if (sub.corrected === false) uncorrected.push(k);
  }

  for (const k of ABSOLUTE_KEYS) {
    const sub = table.subjects[k];
    if (!sub) continue;
    const raw = rawOf(input[k], k, sub.max_raw ?? 100);
    if (raw == null) continue;
    if (!Array.isArray(sub.raw_to_grade) || !sub.raw_to_grade.length) {
      throw new GachaejeomError(
        `환산표 ${k}: 절대평가인데 raw_to_grade 가 없습니다.`,
      );
    }
    // 등급은 계단 함수다 — 보간하면 2.5등급 같은 것이 생긴다.
    let grade = sub.raw_to_grade[sub.raw_to_grade.length - 1][1];
    for (const [r, gval] of sub.raw_to_grade) {
      if (r === Math.round(raw)) {
        grade = gval;
        break;
      }
    }
    out[k] = { raw, grade };
  }

  const complete = RELATIVE_KEYS.every((k) => out[k]?.std != null);
  return {
    subjects: out,
    complete,
    disclaimer: table.disclaimer || DEFAULT_DISCLAIMER,
    uncorrected,
  };
}
