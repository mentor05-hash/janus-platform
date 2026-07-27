/**
 * N33 ㉚ — 과목 canonical 세트 + 별칭 정규화(순수).
 * free-text 과목명을 표준 과목으로 접어 과목 오각형 파편화를 막는다('수학'·'미적분'·'확통' → 수학).
 * 미인식 과목은 원문(트림)을 유지해 정보 손실을 막고, 빈/공백은 ''로 반환해 '기타' 버킷 결정을 호출부에 위임한다.
 * 정책값(N33 [DEC] ㉚): 대분류 7종. 세부 과목은 별칭으로 대분류에 매핑.
 */
export const CANONICAL_SUBJECTS = [
  '국어',
  '수학',
  '영어',
  '한국사',
  '사회탐구',
  '과학탐구',
  '제2외국어/한문',
] as const;
export type CanonicalSubject = (typeof CANONICAL_SUBJECTS)[number];

/** 세부/약칭 과목 → canonical 대분류. 키는 foldKey(공백 제거·소문자) 후 비교. */
const ALIAS: Record<string, CanonicalSubject> = {
  // 국어
  독서: '국어',
  문학: '국어',
  화법과작문: '국어',
  화작: '국어',
  언어와매체: '국어',
  언매: '국어',
  국어영역: '국어',
  // 수학
  수1: '수학',
  수2: '수학',
  수학1: '수학',
  수학2: '수학',
  미적분: '수학',
  미적: '수학',
  확률과통계: '수학',
  확통: '수학',
  기하: '수학',
  수학영역: '수학',
  // 영어
  영어1: '영어',
  영어2: '영어',
  영어독해: '영어',
  영어독해와작문: '영어',
  영어영역: '영어',
  english: '영어',
  // 한국사
  국사: '한국사',
  // 사회탐구
  생활과윤리: '사회탐구',
  생윤: '사회탐구',
  윤리와사상: '사회탐구',
  윤사: '사회탐구',
  한국지리: '사회탐구',
  한지: '사회탐구',
  세계지리: '사회탐구',
  세지: '사회탐구',
  사회문화: '사회탐구',
  사문: '사회탐구',
  정치와법: '사회탐구',
  정법: '사회탐구',
  경제: '사회탐구',
  동아시아사: '사회탐구',
  동사: '사회탐구',
  세계사: '사회탐구',
  사탐: '사회탐구',
  // 과학탐구
  물리: '과학탐구',
  물리학: '과학탐구',
  물1: '과학탐구',
  물2: '과학탐구',
  물리1: '과학탐구',
  물리2: '과학탐구',
  화학: '과학탐구',
  화1: '과학탐구',
  화2: '과학탐구',
  생명과학: '과학탐구',
  생명: '과학탐구',
  생1: '과학탐구',
  생2: '과학탐구',
  생물: '과학탐구',
  지구과학: '과학탐구',
  지구: '과학탐구',
  지1: '과학탐구',
  지2: '과학탐구',
  과탐: '과학탐구',
  // 제2외국어/한문
  한문: '제2외국어/한문',
  일본어: '제2외국어/한문',
  중국어: '제2외국어/한문',
  독일어: '제2외국어/한문',
  프랑스어: '제2외국어/한문',
  스페인어: '제2외국어/한문',
  제2외국어: '제2외국어/한문',
};

/** 비교 키: 트림 + 내부 공백 제거 + 소문자. */
const foldKey = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

const CANON_FOLDED = new Map<string, CanonicalSubject>(
  CANONICAL_SUBJECTS.map((s) => [foldKey(s), s]),
);
const ALIAS_FOLDED: Record<string, CanonicalSubject> = Object.fromEntries(
  Object.entries(ALIAS).map(([k, v]) => [foldKey(k), v]),
);

const CANON_SET = new Set<string>(CANONICAL_SUBJECTS);

/**
 * 과목명 정규화. 인식되면 canonical 대분류, 미인식이면 트림 원문(정보 보존),
 * 빈/공백이면 ''(호출부의 '기타' 버킷 결정에 위임).
 */
export function normalizeSubject(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  const key = foldKey(trimmed);
  return CANON_FOLDED.get(key) ?? ALIAS_FOLDED[key] ?? trimmed;
}

/** canonical 대분류 여부. */
export const isCanonicalSubject = (s: string): s is CanonicalSubject =>
  CANON_SET.has(s);
