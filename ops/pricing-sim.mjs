#!/usr/bin/env node
/**
 * 야누스 크레딧 경제 · 유료 티어 가격 시뮬레이터 (N23 / B001 결정 보조)
 *
 * 목적: "가격을 얼마로 할까"를 감이 아니라 **구조 계산**으로 좁힌다.
 *   구독가 · 부여 크레딧 · 소멸률 · 배분율을 넣으면
 *   1인당 월 공헌이익 · 공헌이익률 · 손익분기 유료회원 수 · 체감 가치를 뽑는다.
 *
 * 이 스크립트는 **의사결정 근거 산출기**이고 런타임 코드가 아니다.
 * 확정된 숫자는 코드에 박지 않고 DB 정책(subscription_plan.price / membership_grade.weekly_credits
 * / pricing_policy)으로 들어간다 — 배포 없이 바꿀 수 있어야 하기 때문(§5-2 단일 소스).
 *
 * 실행:
 *   node ops/pricing-sim.mjs            # 표 출력
 *   node ops/pricing-sim.mjs --json     # 기계 판독용 JSON
 *   node ops/pricing-sim.mjs --selfcheck    # 불변식 검증(종료코드 0/1)
 *   node ops/pricing-sim.mjs --ladder-probe # VIP 부여량 ↑ 시 마진 대가 표
 *
 * 값의 출처(중요 — 가정과 사실을 섞지 않는다):
 *   [코드]  apps/api/src/config/constants.ts · payroll.service.ts · llm/media.module.ts
 *   [시드]  apps/api/prisma/seed.ts (잇올 승계 데모값)
 *   [단가]  claude-api 스킬 캐시(2026-06-24) — Sonnet 4.6 $3/$15 per 1M
 *   [가정]  아래 ASSUMPTIONS 중 source:'가정' — 확정 전 반드시 실측/견적으로 교체
 */

// ─────────────────────────────────────────────────────────────
// 0. 코드에서 가져온 고정 규칙 (바꾸면 코드도 바뀌어야 하는 값)
// ─────────────────────────────────────────────────────────────

/** O1 크레딧→원 환산. constants.ts CREDIT_WON_RATIO */
const CREDIT_WON_RATIO = 0.5;
/** 급여 배분율 기본값(%). payroll.service.ts SHARE_DEFAULT */
const SHARE_PCT_DEFAULT = 60;
/** 요금 기본값(크레딧). constants.ts PRICING_DEFAULTS */
const PRICING = {
  perHour: { board: 12_000, chat: 18_000, zoom: 40_000, hand: 36_000, offline: 30_000 },
  boardItemFee: 8_000,
  boardGeneralFee: 4_000,
};
/** 주 → 월 환산. 365/7/12 */
const WEEKS_PER_MONTH = 365 / 7 / 12;

/** B008 일 상한. llm.module.ts / media.module.ts */
const CAPS = {
  llmTotal: 400,
  llmByPurpose: { report: 100, similarity: 300, ocr: 100, consulting: 60 },
  mediaTokens: 600,
  mediaRecordings: 40,
};

// ─────────────────────────────────────────────────────────────
// 1. 가정값 — 확정 전 교체 대상. source 를 반드시 달아 둔다.
// ─────────────────────────────────────────────────────────────

const ASSUMPTIONS = {
  fxWonPerUsd: { v: 1_400, source: '가정', note: '보수적 기획 환율. 확정 시 실환율로 교체' },
  pgFeePct: { v: 3.0, source: '가정', note: 'PG 카드 수수료. 계약 후 실계약율로 교체' },
  fixedMonthlyWon: {
    v: 150_000,
    source: '가정',
    note: '자가 호스팅 고정비(전기·도메인·백업 스토리지·예비). 인건비 미포함',
  },
  founderMonthlyWon: {
    v: 3_000_000,
    source: '가정',
    note: '1인 체제 대표 생계비. 이걸 빼면 손익분기가 무의미하게 낮게 나온다',
  },
  sfuWonPerParticipantMinute: { v: 1.5, source: '가정', note: 'SFU 참가자·분 단가. 견적 후 교체' },
  recordingWonPerMinute: { v: 30, source: '가정', note: '녹화 egress+보관 분당. 견적 후 교체' },
  /** LLM 용도별 1콜 토큰 추정 — 프롬프트 실측 후 교체 */
  llmTokens: {
    v: {
      ocr: { in: 2_800, out: 600 },
      consulting: { in: 6_000, out: 2_000 },
      similarity: { in: 2_000, out: 200 },
      report: { in: 1_200, out: 400 },
    },
    source: '가정',
    note: '이미지 OCR 은 이미지 토큰 포함 추정. 실측 로그로 교체',
  },
  /** 유료회원 1인 월 LLM 호출 수 추정 */
  llmCallsPerUserMonth: {
    v: { ocr: 1.0, consulting: 0.3, similarity: 2.0, report: 0.1 },
    source: '가정',
    note: '성적표 1회·컨설팅 분석 분기당 1회·Q&A 유사도 2회 가정',
  },
  /** 모델 단가 $/1M — claude-api 스킬 캐시(2026-06-24). ANTHROPIC_MODEL 기본값 = sonnet-4-6 */
  modelUsdPer1M: { v: { in: 3.0, out: 15.0 }, source: '단가', note: 'Claude Sonnet 4.6' },
};

const A = Object.fromEntries(Object.entries(ASSUMPTIONS).map(([k, o]) => [k, o.v]));

// ─────────────────────────────────────────────────────────────
// 2. 원가 계산
// ─────────────────────────────────────────────────────────────

const won = (n) => Math.round(n);

/** LLM 1콜 원가(원). */
function llmCallWon(purpose) {
  const t = A.llmTokens[purpose];
  const usd = (t.in / 1e6) * A.modelUsdPer1M.in + (t.out / 1e6) * A.modelUsdPer1M.out;
  return usd * A.fxWonPerUsd;
}

/** 유료회원 1인 월 AI 원가(원) — 상한과 무관한 "정상 사용" 추정. */
function aiCostPerUserWon() {
  return won(
    Object.entries(A.llmCallsPerUserMonth).reduce(
      (s, [p, n]) => s + n * llmCallWon(p),
      0,
    ),
  );
}

/**
 * B008 일 상한이 허용하는 **최대 AI 비용**(원/월).
 * 합산 상한(400)을 비싼 용도부터 채우는 최악 조합 — 상한이 실제로 천장 역할을 하는지 본다.
 */
function aiCeilingMonthlyWon() {
  const byCost = Object.keys(CAPS.llmByPurpose)
    .map((p) => ({ p, cost: llmCallWon(p), cap: CAPS.llmByPurpose[p] }))
    .sort((x, y) => y.cost - x.cost);
  let left = CAPS.llmTotal;
  let daily = 0;
  for (const { cost, cap } of byCost) {
    const n = Math.min(cap, left);
    daily += n * cost;
    left -= n;
    if (left <= 0) break;
  }
  return won(daily * 30);
}

/** 미디어 상한이 허용하는 최대 비용(원/월). 녹화 egress 가 지배적. */
function mediaCeilingMonthlyWon(avgSessionMinutes = 30) {
  const tokens = CAPS.mediaTokens * avgSessionMinutes * A.sfuWonPerParticipantMinute;
  const rec = CAPS.mediaRecordings * avgSessionMinutes * A.recordingWonPerMinute;
  return won((tokens + rec) * 30);
}

// ─────────────────────────────────────────────────────────────
// 3. 구독 유닛 이코노믹스
// ─────────────────────────────────────────────────────────────

/**
 * @param {{name:string, priceWon:number, grant:number, expirePolicy:'end_of_week'|'end_of_month'}} plan
 * @param {{expiryRate:number, sharePct?:number, sessionMinutes?:number, participantsPerSession?:number}} use
 */
function simulateSubscription(plan, use) {
  const sharePct = use.sharePct ?? SHARE_PCT_DEFAULT;
  const monthlyGrant =
    plan.expirePolicy === 'end_of_week' ? plan.grant * WEEKS_PER_MONTH : plan.grant;
  const consumedCredits = monthlyGrant * (1 - use.expiryRate);

  // 크레딧 매출 → 원 환산(payroll.service.ts 와 동일 식) → 배분
  const creditRevenueWon = won(consumedCredits * CREDIT_WON_RATIO);
  const teacherShareWon = won((creditRevenueWon * sharePct) / 100);

  // 소비 크레딧이 실제로 세션으로 나갔다고 보고 미디어 비용 추정(줌 30분 환산)
  const sessionMinutes = use.sessionMinutes ?? 30;
  const creditsPerSession = won((PRICING.perHour.zoom * sessionMinutes) / 60);
  const sessions = consumedCredits / creditsPerSession;
  const sfuWon = won(
    sessions * sessionMinutes * (use.participantsPerSession ?? 2) * A.sfuWonPerParticipantMinute,
  );

  const pgWon = won((plan.priceWon * A.pgFeePct) / 100);
  const aiWon = aiCostPerUserWon();
  const variableWon = teacherShareWon + pgWon + aiWon + sfuWon;
  const contributionWon = plan.priceWon - variableWon;

  return {
    plan: plan.name,
    priceWon: plan.priceWon,
    grant: plan.grant,
    expirePolicy: plan.expirePolicy,
    expiryRate: use.expiryRate,
    sharePct,
    monthlyGrant: won(monthlyGrant),
    consumedCredits: won(consumedCredits),
    creditRevenueWon,
    teacherShareWon,
    pgWon,
    aiWon,
    sfuWon,
    variableWon,
    contributionWon,
    contributionPct: +((contributionWon / plan.priceWon) * 100).toFixed(1),
    /**
     * 부여배수 — 이 가격 결정의 **단일 핸들**.
     *   nominal  = 부여 크레딧의 원 환산 가치 ÷ 구독가
     *   consumed = 소멸 반영 후 값 ÷ 구독가
     * 배분 원가 = consumed × 구독가 × 배분율 이므로, consumed 가 1.0 이면
     * 배분이 구독가의 60% 를 먹고 공헌이익률은 자동으로 약 37%(= 40% − PG 3%)가 된다.
     * 구조적 상한은 nominal < 1/배분율 = 1.667 — 이걸 넘으면 소멸 0% 에서 반드시 적자다.
     */
    multiple: {
      nominal: +((monthlyGrant * CREDIT_WON_RATIO) / plan.priceWon).toFixed(3),
      consumed: +(creditRevenueWon / plan.priceWon).toFixed(3),
      hardCeiling: +(100 / sharePct).toFixed(3),
    },
    // 체감 가치 — 사용자가 이 돈으로 뭘 살 수 있나.
    //   nominal   = 가격표에 적히는 부여량 기준(= 고객이 비교하는 숫자)
    //   consumed  = 소멸률 반영 후 실제로 쓰는 양 기준(주간 소멸 등급은 여기서 훨씬 나빠진다)
    value: {
      zoom30: +(monthlyGrant / creditsPerSession).toFixed(1),
      boardItem: +(monthlyGrant / PRICING.boardItemFee).toFixed(1),
      wonPerZoom30: won(plan.priceWon / (monthlyGrant / creditsPerSession)),
      wonPerZoom30Consumed: won(plan.priceWon / (consumedCredits / creditsPerSession)),
    },
  };
}

/** 소멸 0%(전원 완전 소진) 스트레스 — 여기서 적자면 구조적 적자다. */
const stress = (plan, use) => simulateSubscription(plan, { ...use, expiryRate: 0 });

/**
 * 손익분기 유료회원 수 — 믹스 가중 평균 공헌이익 기준.
 * 인프라 고정비만 보면 4~9명 같은 무의미한 숫자가 나온다(1인 체제라 인건비가 사실상 전부).
 * 그래서 대표 생계비를 포함한 값을 **판단 기준**으로 함께 낸다.
 */
function breakEven(rows, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  const avg = rows.reduce((s, r, i) => s + r.contributionWon * (weights[i] / total), 0);
  const fixed = A.fixedMonthlyWon;
  const withFounder = fixed + A.founderMonthlyWon;
  const n = (cost) => (avg > 0 ? Math.ceil(cost / avg) : Infinity);
  return {
    avgContributionWon: won(avg),
    fixedMonthlyWon: fixed,
    usersInfraOnly: n(fixed),
    usersWithFounder: n(withFounder),
  };
}

/**
 * B008 일 상한이 **유료회원 몇 명 규모까지** 버티는가.
 * 상한 금액을 고정비와 직접 비교하면 사과-오렌지다(상한은 규모가 커져야 도달한다).
 * 상한 ÷ 1인당 일 사용량 = 상한이 먼저 걸리는 회원 수 → 이게 실제 의미다.
 */
function capCapacity(rowsForMix, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  // 1인당 월 세션 수(믹스 가중) — 소비 크레딧 기준
  const sessionsPerUserMonth = rowsForMix.reduce((s, r, i) => {
    const creditsPerSession = won((PRICING.perHour.zoom * 30) / 60);
    return s + (r.consumedCredits / creditsPerSession) * (weights[i] / total);
  }, 0);
  const sessionsPerUserDay = sessionsPerUserMonth / 30;
  const llmCallsPerUserDay =
    Object.values(A.llmCallsPerUserMonth).reduce((a, b) => a + b, 0) / 30;

  return {
    sessionsPerUserMonth: +sessionsPerUserMonth.toFixed(2),
    /** SFU 접속 토큰: 세션당 참가자 2명 */
    usersAtMediaTokenCap: Math.floor(CAPS.mediaTokens / (sessionsPerUserDay * 2)),
    /** 녹화: 전 세션 녹화 가정(최악) */
    usersAtRecordingCap: Math.floor(CAPS.mediaRecordings / sessionsPerUserDay),
    usersAtLlmCap: Math.floor(CAPS.llmTotal / llmCallsPerUserDay),
  };
}

// ─────────────────────────────────────────────────────────────
// 4. 단품(배치표·입결 시즌 패스) — 크레딧 없음 → 변동비 ≈ PG 뿐
// ─────────────────────────────────────────────────────────────

/**
 * 정적 산출물 판매. 선생님 배분·AI·SFU 가 붙지 않으므로 어떤 가격이든 흑자다.
 * 따라서 결정 기준은 원가가 아니라 ① 저작권 노출 범위 ② 구독 전환 퍼널이다.
 * 그 판단을 돕기 위해 "구독 공헌이익 몇 개월분인가"로 환산해 준다.
 */
function simulatePass(pass, refSubscriptionContributionWon) {
  const pgWon = won((pass.priceWon * A.pgFeePct) / 100);
  const contributionWon = pass.priceWon - pgWon;
  return {
    pass: pass.name,
    priceWon: pass.priceWon,
    validMonths: pass.validMonths,
    pgWon,
    contributionWon,
    contributionPct: +((contributionWon / pass.priceWon) * 100).toFixed(1),
    equivSubscriptionMonths: +(contributionWon / refSubscriptionContributionWon).toFixed(2),
  };
}

// ─────────────────────────────────────────────────────────────
// 5. 3안 — 보수 / 기준(잇올 승계) / 공격
// ─────────────────────────────────────────────────────────────

/** [시드] 잇올 승계값. seed.ts 의 subscription_plan + membership_grade */
const BASE_PLANS = [
  { name: 'Standard', priceWon: 49_000, grant: 30_000, expirePolicy: 'end_of_week' },
  { name: 'Premium', priceWon: 89_000, grant: 210_000, expirePolicy: 'end_of_month' },
  { name: 'VIP', priceWon: 149_000, grant: 350_000, expirePolicy: 'end_of_month' },
];

const scale = (plans, priceMul, grantMul) =>
  plans.map((p) => ({
    ...p,
    priceWon: won((p.priceWon * priceMul) / 1_000) * 1_000,
    grant: won((p.grant * grantMul) / 1_000) * 1_000,
  }));

/**
 * 소멸률은 만료 정책에 따라 다르다 — 주간 소멸(use-it-or-lose-it)은 훨씬 높게 잡는다.
 * 실측 전이므로 보수적(=소멸을 낮게 = 원가를 높게) 쪽으로 본다.
 */
const EXPIRY = { end_of_week: 0.35, end_of_month: 0.15 };

const OPTIONS = {
  A_보수: {
    label: 'A 보수 — 가격 승계 · 부여 15% 축소',
    plans: scale(BASE_PLANS, 1.0, 0.85),
    intent: '마진 방어 우선. 초기 현금 흐름이 얇을 때.',
    /** 소멸 0% 스트레스에서도 흑자여야 하는 안(= 실제로 채택 가능한 안) */
    stressMustPass: true,
    /** 승계값을 균일 배율로 조정한 안이므로 등급 역전이 그대로 남는다(= 예상된 결과) */
    ladderMustPass: false,
  },
  B_기준: {
    label: 'B 기준 — 잇올 승계값 그대로',
    plans: BASE_PLANS,
    intent: '이미 유닛 이코노믹스가 맞춰진 값(배분 60%·소멸 15%·마진 30%)을 승계.',
    stressMustPass: true,
    ladderMustPass: false,
  },
  C_공격: {
    label: 'C 공격 — 가격 12% 인하 · 부여 10% 확대',
    plans: scale(BASE_PLANS, 0.88, 1.1),
    intent:
      '유입·전환 우선. 소멸률이 가정보다 낮으면 가장 먼저 깨진다 — 스트레스 적자를 감수하는 안.',
    /** 이 안은 스트레스에서 적자가 나는 것이 **예상된 결과**다. 그 사실 자체를 검증한다. */
    stressMustPass: false,
    ladderMustPass: false,
  },
  D_등급사다리교정: {
    label: 'D 등급 사다리 교정 — 가격 승계 · Standard 부여 축소 + VIP 부여 확대',
    /**
     * 승계값(A·B·C 전부)에는 **등급 역전**이 있다: 상위 등급으로 갈수록 세션당 단가가 비싸진다
     * (B 기준 7,518 → 8,476 → 8,514원). 업그레이드할 이유가 가격에 없다는 뜻이다.
     *
     * 원인은 배분 모델이다 — 크레딧을 더 주면 배분 원가가 선형으로 늘기 때문에,
     * 상위 등급에 "볼륨 할인"을 주면 마진이 그만큼 깎인다. 그래서 위를 좋게 만드는 대신
     * **아래를 덜 주는 방향**으로 사다리를 세운다(Standard 30,000 → 24,000/주).
     * VIP 는 Premium 대비 우위가 사실상 0(8,476 vs 8,514)이라 부여를 늘려 우위를 만든다.
     */
    plans: [
      { name: 'Standard', priceWon: 49_000, grant: 24_000, expirePolicy: 'end_of_week' },
      { name: 'Premium', priceWon: 89_000, grant: 210_000, expirePolicy: 'end_of_month' },
      { name: 'VIP', priceWon: 149_000, grant: 380_000, expirePolicy: 'end_of_month' },
    ],
    intent: '가격은 승계(마케팅 라운드 숫자 유지)하고 부여량으로만 사다리를 바로 세운다.',
    stressMustPass: true,
    ladderMustPass: true,
  },
};

const PASSES = [
  { name: '입결 단품(시즌)', priceWon: 9_900, validMonths: 2 },
  { name: '배치표+입결 패스', priceWon: 19_000, validMonths: 2 },
  { name: '시즌 풀패스', priceWon: 29_000, validMonths: 3 },
];

/** 회원 믹스 가정 — Standard:Premium:VIP */
const MIX = [5, 3, 2];

function runAll() {
  const out = { assumptions: ASSUMPTIONS, caps: CAPS, options: {}, passes: [], ceilings: {} };

  for (const [key, opt] of Object.entries(OPTIONS)) {
    const rows = opt.plans.map((p) =>
      simulateSubscription(p, { expiryRate: EXPIRY[p.expirePolicy] }),
    );
    const stressRows = opt.plans.map((p) => stress(p, { expiryRate: EXPIRY[p.expirePolicy] }));
    out.options[key] = {
      label: opt.label,
      intent: opt.intent,
      stressMustPass: opt.stressMustPass,
      ladderMustPass: opt.ladderMustPass,
      rows,
      stressRows,
      breakEven: breakEven(rows, MIX),
      stressBreakEven: breakEven(stressRows, MIX),
      capCapacity: capCapacity(rows, MIX),
    };
  }

  const refContribution = out.options.B_기준.rows.find((r) => r.plan === 'Premium').contributionWon;
  out.passes = PASSES.map((p) => simulatePass(p, refContribution));
  out.ceilings = {
    aiMonthlyWon: aiCeilingMonthlyWon(),
    mediaMonthlyWon: mediaCeilingMonthlyWon(),
    llmCallWon: Object.fromEntries(
      Object.keys(CAPS.llmByPurpose).map((p) => [p, won(llmCallWon(p))]),
    ),
    aiPerUserMonthlyWon: aiCostPerUserWon(),
  };
  return out;
}

// ─────────────────────────────────────────────────────────────
// 6. 출력
// ─────────────────────────────────────────────────────────────

const f = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : String(n));
const pad = (s, w, right = true) => {
  const str = String(s);
  // 한글은 폭 2로 세어 표 정렬을 맞춘다
  const width = [...str].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  const sp = ' '.repeat(Math.max(0, w - width));
  return right ? sp + str : str + sp;
};

function printReport(r) {
  console.log('\n야누스 유료 티어 가격 시뮬레이션 (N23 / B001)');
  console.log('='.repeat(96));

  console.log('\n[가정값] — 확정 전 교체 대상');
  for (const [k, o] of Object.entries(r.assumptions)) {
    const v = typeof o.v === 'object' ? JSON.stringify(o.v) : f(o.v);
    console.log(`  ${pad(k, 26, false)} ${pad(o.source, 4)}  ${v}`);
    if (o.note) console.log(`  ${' '.repeat(26)}      └ ${o.note}`);
  }

  for (const [key, o] of Object.entries(r.options)) {
    console.log(`\n${'─'.repeat(96)}\n${o.label}\n  의도: ${o.intent}`);
    console.log(
      `  ${pad('플랜', 10, false)}${pad('구독가', 9)}${pad('부여', 9)}${pad('소멸', 6)}` +
        `${pad('소비크', 9)}${pad('배분', 9)}${pad('PG', 7)}${pad('AI+SFU', 8)}` +
        `${pad('공헌이익', 10)}${pad('률', 7)}`,
    );
    o.rows.forEach((x) => {
      console.log(
        `  ${pad(x.plan, 10, false)}${pad(f(x.priceWon), 9)}${pad(f(x.grant), 9)}` +
          `${pad(`${(x.expiryRate * 100).toFixed(0)}%`, 6)}${pad(f(x.consumedCredits), 9)}` +
          `${pad(f(x.teacherShareWon), 9)}${pad(f(x.pgWon), 7)}${pad(f(x.aiWon + x.sfuWon), 8)}` +
          `${pad(f(x.contributionWon), 10)}${pad(`${x.contributionPct}%`, 7)}`,
      );
    });
    console.log(
      `  ${pad('스트레스(소멸 0%)', 10, false)}` +
        o.stressRows.map((x) => ` ${x.plan} ${f(x.contributionWon)}원(${x.contributionPct}%)`).join(' ·'),
    );
    console.log(
      `  손익분기(믹스 ${MIX.join(':')}) 평균 공헌이익 ${f(o.breakEven.avgContributionWon)}원` +
        ` → 인프라 고정비만 ${f(o.breakEven.usersInfraOnly)}명` +
        ` / 대표 생계비 포함 ${f(o.breakEven.usersWithFounder)}명  ← 판단 기준`,
    );
    console.log(
      `  스트레스(소멸 0%) 손익분기 ${f(o.stressBreakEven.avgContributionWon)}원 →` +
        ` 생계비 포함 ${f(o.stressBreakEven.usersWithFounder)}명`,
    );
    console.log(
      `  상한이 먼저 걸리는 규모: 녹화 ${f(o.capCapacity.usersAtRecordingCap)}명 ·` +
        ` SFU ${f(o.capCapacity.usersAtMediaTokenCap)}명 · LLM ${f(o.capCapacity.usersAtLlmCap)}명` +
        ` (1인 월 ${o.capCapacity.sessionsPerUserMonth}세션 기준)`,
    );
    console.log('  체감 가치(부여 기준): ' +
      o.rows.map((x) => `${x.plan} 줌30분 ${x.value.zoom30}회·문항 ${x.value.boardItem}건(${f(x.value.wonPerZoom30)}원/세션)`).join(' · '));
    const ladder = o.rows.map((x) => x.value.wonPerZoom30);
    const inverted = ladder.some((v, i) => i > 0 && v > ladder[i - 1]);
    console.log(
      `  등급 사다리(부여 기준 세션 단가) ${ladder.map(f).join(' → ')}원` +
        ` ${inverted ? '⚠ 역전 — 상위 등급이 더 비싸다' : '정상 — 상위 등급이 더 싸다'}`,
    );
    console.log(
      `  소멸 반영 세션 단가        ` +
        o.rows.map((x) => `${x.plan} ${f(x.value.wonPerZoom30Consumed)}원`).join(' · '),
    );
    console.log(
      `  부여배수(명목/소비) ` +
        o.rows.map((x) => `${x.plan} ${x.multiple.nominal}/${x.multiple.consumed}`).join(' · ') +
        `  — 구조적 상한 ${o.rows[0].multiple.hardCeiling} (명목이 이걸 넘으면 소멸 0% 에서 반드시 적자)`,
    );
  }

  console.log(`\n${'─'.repeat(96)}\n단품(배치표·입결 시즌 패스) — 크레딧 없음 → 변동비는 PG 뿐`);
  console.log(
    `  ${pad('상품', 22, false)}${pad('가격', 9)}${pad('유효', 6)}${pad('PG', 7)}${pad('공헌이익', 10)}${pad('률', 7)}${pad('B기준 Premium 개월분', 22)}`,
  );
  r.passes.forEach((p) =>
    console.log(
      `  ${pad(p.pass, 22, false)}${pad(f(p.priceWon), 9)}${pad(`${p.validMonths}개월`, 6)}` +
        `${pad(f(p.pgWon), 7)}${pad(f(p.contributionWon), 10)}${pad(`${p.contributionPct}%`, 7)}` +
        `${pad(`${p.equivSubscriptionMonths}개월분`, 22)}`,
    ),
  );

  console.log(`\n${'─'.repeat(96)}\n비용 천장 — B008 일 상한이 실제로 막아 주는 금액`);
  console.log(`  LLM 1콜 원가: ${Object.entries(r.ceilings.llmCallWon).map(([k, v]) => `${k} ${f(v)}원`).join(' · ')}`);
  console.log(`  유료회원 1인 월 AI 원가(정상 사용): ${f(r.ceilings.aiPerUserMonthlyWon)}원`);
  console.log(`  일 상한 전부 소진 시 AI:   ${f(r.ceilings.aiMonthlyWon)}원/월  (상한 없으면 무제한)`);
  console.log(`  일 상한 전부 소진 시 미디어: ${f(r.ceilings.mediaMonthlyWon)}원/월  (녹화 egress 지배)`);
  console.log(
    '  ※ 이 금액을 고정비와 직접 비교하면 안 된다 — 상한은 회원 규모가 커져야 도달한다.' +
      ' 각 안의 "상한이 먼저 걸리는 규모"를 볼 것.',
  );
  console.log('');
}

// ─────────────────────────────────────────────────────────────
// 7. 자기검증 — 가격 결정이 구조를 깨지 않는지 확인
// ─────────────────────────────────────────────────────────────

function selfcheck(r) {
  const fails = [];
  const ok = (cond, msg) => (cond ? console.log(`  PASS  ${msg}`) : fails.push(msg));

  // ① 채택 가능 안(A·B)은 소멸 0%(전원 완전 소진)에서도 공헌이익 ≥ 0 이어야 한다.
  //    C 공격안은 여기서 적자가 나는 것이 **예상된 결과**다 — 그 사실 자체를 고정한다.
  //    (적자가 안 나면 C 를 "공격안"으로 제시할 근거가 사라지므로 그것도 검증 대상이다.)
  for (const [key, o] of Object.entries(r.options)) {
    const worst = Math.min(...o.stressRows.map((x) => x.contributionWon));
    if (o.stressMustPass) {
      o.stressRows.forEach((x) =>
        ok(
          x.contributionWon >= 0,
          `${key} · ${x.plan}: 소멸 0% 에서도 공헌이익 ≥ 0 (${f(x.contributionWon)}원)`,
        ),
      );
    } else {
      ok(
        worst < 0,
        `${key}: 스트레스에서 적자가 확인된다 — 채택 시 소멸률 실측이 선행 조건 (최악 ${f(worst)}원)`,
      );
    }
  }

  // ② 크레딧→원 환산이 payroll.service.ts 식과 같다
  const p = r.options.B_기준.rows.find((x) => x.plan === 'Premium');
  ok(
    p.creditRevenueWon === Math.round(p.consumedCredits * CREDIT_WON_RATIO),
    `크레딧→원 환산식 일치 (${f(p.consumedCredits)}크 × ${CREDIT_WON_RATIO} = ${f(p.creditRevenueWon)}원)`,
  );
  ok(
    p.teacherShareWon === Math.round((p.creditRevenueWon * SHARE_PCT_DEFAULT) / 100),
    `배분식 일치 (원 매출 × ${SHARE_PCT_DEFAULT}% = ${f(p.teacherShareWon)}원)`,
  );

  // ③ 등급 사다리 — 상위 등급일수록 세션당 단가가 싸야 업그레이드 유인이 생긴다.
  //    승계값(A·B·C)에는 역전이 있다. 그것을 "발견 사실"로 고정하고,
  //    교정안(D)에서만 사다리가 바로 서는지 검증한다.
  for (const [key, o] of Object.entries(r.options)) {
    const perSession = o.rows.map((x) => x.value.wonPerZoom30);
    const rightSideUp = perSession.every((v, i) => i === 0 || v <= perSession[i - 1]);
    if (o.ladderMustPass) {
      ok(rightSideUp, `${key}: 상위 등급일수록 세션 단가가 싸다 (${perSession.map(f).join(' → ')}원)`);
    } else {
      ok(
        !rightSideUp,
        `${key}: 승계값의 등급 역전이 확인된다 — 교정 없이 채택하면 상위 등급 유인이 없다` +
          ` (${perSession.map(f).join(' → ')}원)`,
      );
    }
  }

  // ④ 단품은 구독 1개월 공헌이익을 넘지 않아야 한다 — 넘으면 구독을 팔 이유가 사라진다
  r.passes.forEach((x) =>
    ok(
      x.equivSubscriptionMonths <= 1.0,
      `단품 "${x.pass}" 공헌이익이 구독 1개월분 이내 (${x.equivSubscriptionMonths}개월분)`,
    ),
  );

  // ④-b 부여배수 구조 상한 — 채택 가능 안(stressMustPass)은 명목 부여배수가 1/배분율 미만이어야 한다.
  //     이 한 줄이 "소멸률 가정이 틀려도 적자가 안 난다"를 보장한다.
  for (const [key, o] of Object.entries(r.options)) {
    if (!o.stressMustPass) continue;
    o.rows.forEach((x) =>
      ok(
        x.multiple.nominal < x.multiple.hardCeiling,
        `${key} · ${x.plan}: 명목 부여배수 ${x.multiple.nominal} < 구조적 상한 ${x.multiple.hardCeiling}`,
      ),
    );
  }

  // ⑤ B008 상한이 손익분기 도달을 막지 않아야 한다 — 막으면 상한 자체가 성장 저지선이 된다.
  const be = r.options.B_기준.breakEven;
  const cc = r.options.B_기준.capCapacity;
  ok(
    Math.min(cc.usersAtMediaTokenCap, cc.usersAtLlmCap) >= be.usersWithFounder,
    `상한이 손익분기 회원수(${f(be.usersWithFounder)}명) 도달을 막지 않는다` +
      ` (SFU ${f(cc.usersAtMediaTokenCap)}명 · LLM ${f(cc.usersAtLlmCap)}명)`,
  );
  // 녹화는 전 세션 녹화라는 최악 가정에서 가장 먼저 걸린다 — 막히면 상한 조정이 아니라
  // "녹화 기본 OFF" 가 정답이다. 여기서는 그 사실을 드러내는 것까지가 목적.
  if (cc.usersAtRecordingCap < be.usersWithFounder) {
    console.log(
      `  NOTE  녹화 상한(${CAPS.mediaRecordings}건/일)은 유료회원 ${f(cc.usersAtRecordingCap)}명 규모에서` +
        ` 먼저 걸린다(전 세션 녹화 가정) — 손익분기 ${f(be.usersWithFounder)}명 이전이므로` +
        ` 녹화 기본 OFF 또는 상한 상향이 필요하다.`,
    );
  }

  // ⑥ 공헌이익률이 기획서 목표(30%) 근방인 안이 최소 1개는 있어야 한다
  const has30 = Object.values(r.options).some((o) =>
    o.rows.some((x) => x.contributionPct >= 30),
  );
  ok(has30, '공헌이익률 30% 이상을 내는 안이 존재한다(기획서 마진 목표)');

  if (fails.length) {
    console.log(`\n  FAIL ${fails.length}건`);
    fails.forEach((m) => console.log(`  FAIL  ${m}`));
    return 1;
  }
  console.log('\n  전부 통과');
  return 0;
}

// ─────────────────────────────────────────────────────────────

/**
 * 등급 사다리 탐침 — "VIP 부여를 올려서 우위를 만들면 마진이 얼마나 깎이나"를 표로 낸다.
 * 워크시트 §3 의 "위를 좋게 만드는 대신 아래를 덜 준다"는 판단의 근거.
 */
function ladderProbe() {
  const premium = { name: 'Premium', priceWon: 89_000, grant: 210_000, expirePolicy: 'end_of_month' };
  const ref = simulateSubscription(premium, { expiryRate: EXPIRY.end_of_month });
  const refPerSession = ref.value.wonPerZoom30;
  console.log(`\n등급 사다리 탐침 — VIP 부여량을 올릴 때의 대가`);
  console.log('='.repeat(96));
  console.log(`  기준: Premium 89,000원 / 210,000크 → ${f(refPerSession)}원/세션`);
  console.log(
    `  ${pad('VIP 부여', 10)}${pad('세션단가', 10)}${pad('Premium 대비', 13)}` +
      `${pad('공헌이익', 10)}${pad('률', 7)}${pad('스트레스', 10)}${pad('률', 7)}${pad('명목배수', 9)}`,
  );
  for (const grant of [350_000, 380_000, 410_000, 440_000, 470_000, 500_000]) {
    const plan = { name: 'VIP', priceWon: 149_000, grant, expirePolicy: 'end_of_month' };
    const r = simulateSubscription(plan, { expiryRate: EXPIRY.end_of_month });
    const st = stress(plan, { expiryRate: EXPIRY.end_of_month });
    const adv = ((refPerSession - r.value.wonPerZoom30) / refPerSession) * 100;
    console.log(
      `  ${pad(f(grant), 10)}${pad(f(r.value.wonPerZoom30), 10)}${pad(`${adv.toFixed(1)}% 유리`, 13)}` +
        `${pad(f(r.contributionWon), 10)}${pad(`${r.contributionPct}%`, 7)}` +
        `${pad(f(st.contributionWon), 10)}${pad(`${st.contributionPct}%`, 7)}` +
        `${pad(r.multiple.nominal, 9)}`,
    );
  }
  console.log('');
}

const argv = process.argv.slice(2);
const result = runAll();
if (argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else if (argv.includes('--ladder-probe')) {
  ladderProbe();
} else if (argv.includes('--selfcheck')) {
  console.log('\n크레딧 경제 불변식 검증');
  console.log('='.repeat(96));
  process.exit(selfcheck(result));
} else {
  printReport(result);
}
