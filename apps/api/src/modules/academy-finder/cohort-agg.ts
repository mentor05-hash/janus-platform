// 재원생 집계(verified) 순수 로직 — 스펙 §3·§4. k-익명(n≥5)·기타 합산·개별 비노출.
// 부수효과 없음 — 단위테스트 대상. 집계 잡이 이 함수들로 payload 를 만든다.

/** verified 최소 재원 수([DEC⑳] 기본 5). 미만이면 cohort 미생성. */
export const VERIFIED_MIN_N = Number(process.env.ACADEMY_VERIFIED_MIN_N) || 5;

/** 등급(1~9) → 성적 밴드. 스펙 §2 payload 키. */
export function gradeToBand(
  grade: number,
): '1-2' | '3-4' | '5-6' | '7-9' | null {
  if (!Number.isFinite(grade)) return null;
  if (grade < 1) return null; // 등급 체계는 1~9 — 하한 밖(0·음수)은 무효
  if (grade <= 2) return '1-2';
  if (grade <= 4) return '3-4';
  if (grade <= 6) return '5-6';
  if (grade <= 9) return '7-9';
  return null;
}

const BANDS = ['1-2', '3-4', '5-6', '7-9'] as const;

/**
 * 등급 배열 → 밴드 분포 %(정수). 노출은 % 만(스펙 §2). 반올림 후 합 100 보정.
 * 개별 등급은 저장하지 않는다(분포만).
 */
export function toBandPercent(grades: number[]): Record<string, number> {
  const counts: Record<string, number> = {
    '1-2': 0,
    '3-4': 0,
    '5-6': 0,
    '7-9': 0,
  };
  let n = 0;
  for (const g of grades) {
    const b = gradeToBand(g);
    if (b) {
      counts[b] += 1;
      n += 1;
    }
  }
  if (n === 0) return {};
  const pct: Record<string, number> = {};
  for (const b of BANDS) pct[b] = Math.round((counts[b] / n) * 100);
  // 반올림 오차 → 최대 밴드에 보정하여 합 100.
  const sum = BANDS.reduce((a, b) => a + pct[b], 0);
  if (sum !== 100) {
    const top = BANDS.reduce((mx, b) => (pct[b] > pct[mx] ? b : mx), BANDS[0]);
    pct[top] += 100 - sum;
  }
  return pct;
}

/**
 * 출신학교 분포 — k-익명(§4): n<minN 인 학교는 "기타"로 합산. 개별 학생 미노출.
 * 입력: 학교명 배열(null/빈값은 무시). 반환: [{school,n}] (기타 포함, n 내림차순).
 */
export function kAnonSchoolDist(
  schools: Array<string | null | undefined>,
  minN: number = VERIFIED_MIN_N,
): Array<{ school: string; n: number }> {
  const counts = new Map<string, number>();
  for (const s of schools) {
    const name = (s ?? '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let etc = 0;
  const kept: Array<{ school: string; n: number }> = [];
  for (const [school, n] of counts) {
    if (n >= minN) kept.push({ school, n });
    else etc += n;
  }
  kept.sort((a, b) => b.n - a.n);
  if (etc > 0) kept.push({ school: '기타', n: etc });
  return kept;
}
