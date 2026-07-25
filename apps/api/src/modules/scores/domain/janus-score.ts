/**
 * janus_score 변환(순수) — O43 규약(v22 키 동결) + 배치표 핸드오프(2026-07-14) C1 계약.
 * 키: { gye, nb | (kor,mat,tam1,tam2), eng, han } — gye∈{이과,문과} · nb=전국누백 · 표점 4종과 nb 중 택1.
 * 확장 필드(하위호환 추가만 허용): mode('std'|'nb'), period, source(근거 배지용).
 * 스펙: docs/janus_score_변환스펙_v1_2026-07-07.md (§5 검증 — 위반 필드는 무시).
 */

export interface JanusScoreItem {
  subject: string;
  score: number | null;
  grade: string | null;
}

export interface JanusScoreReport {
  period: string;
  source: string;
  placement: Record<string, unknown> | null;
  items: JanusScoreItem[];
}

export interface JanusScore {
  gye: '이과' | '문과' | null;
  mode: 'std' | 'nb';
  kor?: number;
  mat?: number;
  tam1?: number;
  tam2?: number;
  nb?: number;
  eng?: number;
  han?: number;
  period: string;
  source: string;
}

/* 과목명 별칭 — OCR·수동 입력의 표기 편차 흡수 */
const ALIAS: Record<'kor' | 'mat' | 'tam1' | 'tam2' | 'eng' | 'han', string[]> = {
  kor: ['국어'],
  mat: ['수학'],
  tam1: ['탐구1', '탐구①', '과학', '사회', '탐구'],
  tam2: ['탐구2', '탐구②', '사회', '과학'], // used 집합으로 탐1과 중복 배정 방지(과학+사회 조합 흡수)
  eng: ['영어'],
  han: ['한국사'],
};

function pick(items: JanusScoreItem[], key: keyof typeof ALIAS, used: Set<string>): JanusScoreItem | null {
  for (const name of ALIAS[key]) {
    const it = items.find((i) => !used.has(i.subject) && i.subject.trim() === name);
    if (it) {
      used.add(it.subject);
      return it;
    }
  }
  return null;
}

const intIn = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n as number);
  return r >= min && r <= max ? r : null;
};

/**
 * placement.nb → 전국누백(0.01~99.99, 소수 2자리). 범위를 벗어나거나 수치가 아니면 null.
 * 이력 통계(변동성 판정 O108)도 **이 함수만** 쓴다 — 검증이 갈라지면 오염값(0·음수·150) 하나가
 * best/worst 를 통째로 바꿔 밴드 뒤집힘 판정이 거짓이 된다.
 */
export function parseNb(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : (raw as number | undefined);
  if (!Number.isFinite(n) || (n as number) <= 0 || (n as number) >= 100) return null;
  return Math.round((n as number) * 100) / 100;
}

/** 최신 리포트 → janus_score. 산출 불가(성적 없음)면 null — API 는 404 NO_SCORE. */
export function toJanusScore(report: JanusScoreReport | null | undefined): JanusScore | null {
  if (!report) return null;
  const pl = report.placement ?? {};
  const gyeRaw = (pl as { gye?: unknown }).gye;
  const gye: JanusScore['gye'] = gyeRaw === '이과' || gyeRaw === '문과' ? gyeRaw : null;

  const used = new Set<string>();
  const kor = pick(report.items, 'kor', used);
  const mat = pick(report.items, 'mat', used);
  const tam1 = pick(report.items, 'tam1', used);
  const tam2 = pick(report.items, 'tam2', used);
  const eng = pick(report.items, 'eng', used);
  const han = pick(report.items, 'han', used);

  const base = {
    gye,
    period: report.period,
    source: report.source,
    // eng/han = 절대평가 등급 1~9 (§5)
    ...(intIn(eng?.grade ?? eng?.score, 1, 9) != null ? { eng: intIn(eng?.grade ?? eng?.score, 1, 9)! } : {}),
    ...(intIn(han?.grade ?? han?.score, 1, 9) != null ? { han: intIn(han?.grade ?? han?.score, 1, 9)! } : {}),
  };

  // 모드 1 — 전국누백(placement.nb): 소수 허용 0.01~99.99
  const nb = parseNb((pl as { nb?: unknown }).nb);
  if (nb != null) {
    return { ...base, mode: 'nb', nb };
  }

  // 모드 2 — 표점 4종(std 0~200, §5). 결측 있으면 산출 불가(부분 자동입력은 클라이언트 몫이나
  // 계약상 "표점 4종 또는 nb 택1"이므로 4종 완비 시에만 내보낸다.
  const std = {
    kor: intIn(kor?.score, 0, 200),
    mat: intIn(mat?.score, 0, 200),
    tam1: intIn(tam1?.score, 0, 200),
    tam2: intIn(tam2?.score, 0, 200),
  };
  if (std.kor != null && std.mat != null && std.tam1 != null && std.tam2 != null) {
    return { ...base, mode: 'std', kor: std.kor, mat: std.mat, tam1: std.tam1, tam2: std.tam2 };
  }
  return null;
}

/** URL 파라미터 생성(스펙 §3) — v22 가 읽는 키 그대로(키 이름 변경 금지, C1/C3 규칙). */
export function buildJanusScoreParams(s: JanusScore): string {
  const p = new URLSearchParams();
  if (s.gye) p.set('gye', s.gye);
  if (s.mode === 'nb' && s.nb != null) p.set('nb', String(s.nb));
  if (s.mode === 'std') {
    p.set('kor', String(s.kor));
    p.set('mat', String(s.mat));
    p.set('tam1', String(s.tam1));
    p.set('tam2', String(s.tam2));
  }
  if (s.eng != null) p.set('eng', String(s.eng));
  if (s.han != null) p.set('han', String(s.han));
  return p.toString();
}
