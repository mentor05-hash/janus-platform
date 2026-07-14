/**
 * 관문 해석 도메인(순수) — W2 D5.
 * 자유서술 입력 → ① 민감정보 마스킹 ② 의도 분류 ③ 커리큘럼 카드 구성.
 * 실모델(LLM) 실패·미구성·일 상한 초과 시에도 이 규칙 분류가 항상 동작한다(폴백 불변식).
 */

export type GatewayIntent =
  | 'diagnosis' // 진단(배치표·격차)
  | 'qna' // 질문·답변
  | 'consulting' // 상담·컨설팅
  | 'tutoring' // 1:1 과외
  | 'lecture' // 강의(VOD)
  | 'mental' // 멘탈·컨디션(버티컬)
  | 'unknown';

export interface GatewayCard {
  title: string;
  desc: string;
  service: GatewayIntent | 'curriculum';
  to: string; // 웹 라우트
}

export interface GatewayInterpretation {
  intent: GatewayIntent;
  summary: string; // 입력을 한 줄로 되짚는 요약(단정 금지 톤)
  cards: GatewayCard[]; // 커리큘럼 카드(다음 문) 1~3장
}

export const GATEWAY_INTENTS: GatewayIntent[] = [
  'diagnosis', 'qna', 'consulting', 'tutoring', 'lecture', 'mental', 'unknown',
];

/** 의도별 대표 카드(규칙 폴백·LLM 카드 보정 공용). */
export const INTENT_CARDS: Record<GatewayIntent, GatewayCard[]> = {
  diagnosis: [
    { title: '배치표로 지금 위치 확인', desc: '성적 입력 → 안정·적정·소신·상향 4구간', service: 'diagnosis', to: '/placement' },
    { title: '격차 리포트', desc: '목표까지 부족분을 근거와 함께', service: 'diagnosis', to: '/placement/gap' },
    { title: '전략 상담으로 잇기', desc: '진단 근거 위에서 지원선 설계', service: 'consulting', to: '/consulting/apply' },
  ],
  qna: [
    { title: '질문 올리기', desc: '사진 한 장 → ✦ AI 초안 즉시, 선생님 검토', service: 'qna', to: '/student/qna' },
    { title: '자주 막히는 단원이라면', desc: '1:1 과외로 원인부터', service: 'tutoring', to: '/student/search' },
  ],
  consulting: [
    { title: '상담 신청', desc: '배치표·격차 근거 위 1:1 전략 상담', service: 'consulting', to: '/consulting/apply' },
    { title: '먼저 진단부터', desc: '상담 전 배치표로 현재 위치 확인', service: 'diagnosis', to: '/placement' },
  ],
  tutoring: [
    { title: '선생님 찾기', desc: '풀별 응답시간·만족도로 1:1 매칭', service: 'tutoring', to: '/student/search' },
    { title: '격차 확인 후 매칭', desc: '진단이 과목·단원을 좁혀줍니다', service: 'diagnosis', to: '/placement' },
  ],
  lecture: [
    { title: '커리큘럼에서 강의로', desc: '처방 카드에서 필요한 강의로 연결', service: 'lecture', to: '/services/lecture' },
    { title: '진단으로 우선순위 정하기', desc: '어떤 강의부터인지 격차가 답합니다', service: 'diagnosis', to: '/placement' },
  ],
  mental: [
    { title: '컨디션·불안 관리', desc: '멘탈 팩 — 차분하게, 지킨 것부터', service: 'mental', to: '/services' },
    { title: '상담으로 잇기', desc: '혼자 무겁다면 1:1 상담', service: 'consulting', to: '/consulting/apply' },
  ],
  unknown: [
    { title: '성적으로 진단받기', desc: '배치표·격차 리포트 — 무료로 시작', service: 'diagnosis', to: '/placement' },
    { title: '질문 올리기', desc: '문제 사진 한 장이면 AI 초안 즉시', service: 'qna', to: '/student/qna' },
    { title: '선생님 찾기', desc: '상담·과외 1:1 매칭', service: 'tutoring', to: '/student/search' },
  ],
};

/* 민감정보 마스킹 — LLM 투입 전 필수(실행계획서 W2 D5 "입력 마스킹").
 * 전화번호·이메일·주민번호 패턴을 토큰으로 치환. */
const PHONE = /01[016789][ -]?\d{3,4}[ -]?\d{4}/g;
const TEL = /0\d{1,2}[ -]?\d{3,4}[ -]?\d{4}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const RRN = /\d{6}[ -]?[1-4]\d{6}/g;

export function maskSensitive(text: string): { masked: string; hits: number } {
  let hits = 0;
  const count = (m: string) => { hits += 1; return m; };
  let masked = (text ?? '');
  masked = masked.replace(RRN, (m) => (count(m), '[주민번호]'));
  masked = masked.replace(PHONE, (m) => (count(m), '[전화번호]'));
  masked = masked.replace(EMAIL, (m) => (count(m), '[이메일]'));
  masked = masked.replace(TEL, (m) => (count(m), '[전화번호]'));
  return { masked: masked.slice(0, 300).trim(), hits };
}

/* 규칙 분류(폴백) — 키워드 우선순위 순서대로 검사. */
const RULES: Array<{ intent: GatewayIntent; kws: string[] }> = [
  { intent: 'mental', kws: ['불안', '멘탈', '슬럼프', '무기력', '우울', '스트레스', '잠', '수면', '컨디션'] },
  { intent: 'qna', kws: ['질문', '문제', '모르', '풀이', '해설', '막혔', '틀렸'] },
  { intent: 'consulting', kws: ['상담', '컨설팅', '전략', '어디 갈', '지원', '원서', '전형', '수시', '정시 전략'] },
  { intent: 'tutoring', kws: ['과외', '선생님', '1:1', '일대일', '개인지도'] },
  { intent: 'lecture', kws: ['강의', '인강', 'vod', '수업 듣'] },
  { intent: 'diagnosis', kws: ['배치', '진단', '성적', '등급', '백분위', '표점', '모의고사', '컷', '가고 싶', '갈 수 있', '합격'] },
];

export function classifyGateway(masked: string): GatewayInterpretation {
  const t = (masked ?? '').toLowerCase();
  let intent: GatewayIntent = 'unknown';
  for (const r of RULES) {
    if (r.kws.some((k) => t.includes(k))) { intent = r.intent; break; }
  }
  const head = masked.length > 40 ? `${masked.slice(0, 40)}…` : masked;
  const summary =
    intent === 'unknown'
      ? '입력을 규칙으로 해석했어요. 가장 빠른 시작은 진단입니다.'
      : `"${head}" — ${INTENT_LABEL[intent]} 쪽 문을 먼저 열어볼게요.`;
  return { intent, summary, cards: INTENT_CARDS[intent] };
}

export const INTENT_LABEL: Record<GatewayIntent, string> = {
  diagnosis: '진단(배치표·격차)',
  qna: '질문·답변',
  consulting: '상담·컨설팅',
  tutoring: '1:1 과외',
  lecture: '강의',
  mental: '멘탈·컨디션',
  unknown: '탐색',
};

/** LLM 산출 보정: 모르는 intent → unknown, 카드 없으면 규칙 카드로 채움(항상 1~3장 보장). */
export function normalizeLlmResult(raw: Partial<GatewayInterpretation> | null | undefined): GatewayInterpretation {
  const intent: GatewayIntent = GATEWAY_INTENTS.includes(raw?.intent as GatewayIntent)
    ? (raw!.intent as GatewayIntent)
    : 'unknown';
  const cards = (raw?.cards ?? [])
    .filter((c) => c && typeof c.title === 'string' && typeof c.to === 'string')
    .slice(0, 3);
  return {
    intent,
    summary: typeof raw?.summary === 'string' && raw.summary.trim() ? raw.summary.trim().slice(0, 200) : INTENT_LABEL[intent],
    cards: cards.length ? cards : INTENT_CARDS[intent],
  };
}

/** 일 호출 상한 판정(순수) — count 는 incr 후 값. */
export function withinDailyBudget(count: number, limit: number): boolean {
  return Number.isFinite(count) && count <= Math.max(0, limit);
}
