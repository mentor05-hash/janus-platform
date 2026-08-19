/**
 * 모바일 디자인 토큰 — 야누스(IANUS) 디자인 시스템 (시안 번들 2026-07-13 추출).
 * 단일 소스: packages/brand/tokens.json → scripts/apply-branding.mjs 가
 * branding.generated.ts 의 TOKENS 로 주입. 라이트/다크 런타임 전환 지원.
 * CTA 위계: 골드 채움=핵심 전환(화면당 1개) · 블루 채움=주요 액션 · 회색=탐색 보조.
 */
import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { COLORS as BRAND, TOKENS } from './branding.generated'; // 화이트라벨 브랜드(설정 주입)

export type Palette = {
  teal: string; teal900: string; teal500: string; teal100: string; teal50: string;
  ink: string; body: string; muted: string; caption: string;
  line: string; lineSoft: string; inputBorder: string;
  bg: string; fill: string; white: string;
  newC: string; newBg: string;
  confirmed: string; confirmedBg: string;
  done: string; doneBg: string;
  mutedChip: string; mutedChipBg: string;
  danger: string; dangerBg: string; dangerBorder: string;
  gradeS: string; gradeA: string; gradeB: string;
  // ── 야누스 확장 토큰 ──
  navy: string; blue: string; gold: string; goldInk: string; silver: string;
  blueSoft: string; goldSoft: string;
  ghostBg: string; ghostBorder: string; arrowMuted: string;
  sigStable: string; sigFit: string; sigReach: string; sigHigh: string;
  sigStableSoft: string; sigFitSoft: string; sigReachSoft: string; sigHighSoft: string;
  ai: string; aiSoft: string; aug: string; augSoft: string; human: string; humanSoft: string;
};

const TL = TOKENS.light;
const TD = TOKENS.dark;

export const LIGHT: Palette = {
  // 레거시 별칭(teal=야누스 블루) — 브랜드 주입 유지
  teal: BRAND.primary, teal900: BRAND.primaryDark, teal500: BRAND.primary500,
  teal100: '#D7E4F2', teal50: '#EEF4FB',
  ink: TL.ink, body: TL.ink2, muted: TL.ink3, caption: TL.arrowMuted,
  line: TL.hair, lineSoft: TL.hair2, inputBorder: '#C6D1E0',
  bg: TL.page, fill: TL.surface2, white: TL.surface,
  newC: TL.blue, newBg: TL.blueSoft,
  confirmed: TL.goldInk, confirmedBg: TL.goldSoft,
  done: TL.stable, doneBg: TL.stableSoft,
  mutedChip: TL.ink2, mutedChipBg: TL.hair2,
  danger: TL.high, dangerBg: TL.highSoft, dangerBorder: '#EFC7BD',
  gradeS: TL.gold, gradeA: TL.blue, gradeB: TL.silver,
  navy: TL.navy, blue: TL.blue, gold: TL.gold, goldInk: TL.goldInk, silver: TL.silver,
  blueSoft: TL.blueSoft, goldSoft: TL.goldSoft,
  ghostBg: TL.ghostBg, ghostBorder: TL.ghostBorder, arrowMuted: TL.arrowMuted,
  sigStable: TL.stable, sigFit: TL.fit, sigReach: TL.reach, sigHigh: TL.high,
  sigStableSoft: TL.stableSoft, sigFitSoft: TL.fitSoft, sigReachSoft: TL.reachSoft, sigHighSoft: TL.highSoft,
  ai: TL.ai, aiSoft: TL.aiSoft, aug: TL.aug, augSoft: TL.augSoft, human: TL.human, humanSoft: TL.humanSoft,
};

// 다크: 야누스 다크 팔레트(선생님·야간) — 표면/텍스트/라인 반전 + 채도 보정.
export const DARK: Palette = {
  teal: TD.blue, teal900: '#6BA8E3', teal500: TD.blue, teal100: '#1C3A5C', teal50: '#14273F',
  ink: TD.ink, body: TD.ink2, muted: TD.ink3, caption: TD.ink3,
  line: TD.hair, lineSoft: TD.surface2, inputBorder: '#2C4159',
  bg: TD.page, fill: TD.surface2, white: TD.surface,
  newC: TD.blue, newBg: TD.blueSoft,
  confirmed: TD.gold, confirmedBg: TD.goldSoft,
  done: TD.stable, doneBg: TD.stableSoft,
  mutedChip: TD.ink2, mutedChipBg: TD.surface2,
  danger: TD.high, dangerBg: TD.highSoft, dangerBorder: '#5C3A33',
  gradeS: TD.gold, gradeA: TD.blue, gradeB: TD.silver,
  navy: TD.navy, blue: TD.blue, gold: TD.gold, goldInk: TD.goldInk, silver: TD.silver,
  blueSoft: TD.blueSoft, goldSoft: TD.goldSoft,
  ghostBg: TD.ghostBg, ghostBorder: TD.ghostBorder, arrowMuted: TD.arrowMuted,
  sigStable: TD.stable, sigFit: TD.fit, sigReach: TD.reach, sigHigh: TD.high,
  sigStableSoft: TD.stableSoft, sigFitSoft: TD.fitSoft, sigReachSoft: TD.reachSoft, sigHighSoft: TD.highSoft,
  ai: TD.ai, aiSoft: TD.aiSoft, aug: TD.aug, augSoft: TD.augSoft, human: TD.human, humanSoft: TD.humanSoft,
};

export const R = { sm: 7, md: 9, card: 14, pill: 999 };
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

/** 카드 그림자(플랫 — 시안은 hair 보더 중심). */
export const shadowCard = {
  shadowColor: '#142D50',
  shadowOpacity: 0.05,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

/** 팔레트 기반 공통 스타일 생성기. */
export function makeUI(C: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, padding: SP.lg, backgroundColor: C.bg },
    title: { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
    h: { fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.3, marginBottom: SP.md },
    label: { color: C.body, fontSize: 13, fontWeight: '500', marginTop: SP.md, marginBottom: 6 },
    sub: { color: C.muted, fontSize: 13, marginTop: 4 },
    input: {
      backgroundColor: C.white, borderWidth: 1, borderColor: C.inputBorder,
      borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: C.ink,
    },
    card: {
      backgroundColor: C.white, borderRadius: R.card, borderWidth: 1, borderColor: C.line,
      padding: 18, ...shadowCard,
    },
    btn: { backgroundColor: C.teal, borderRadius: 11, paddingVertical: 14, alignItems: 'center' },
    btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
    /* 골드 채움 — 그 화면의 "다음 문"(핵심 전환), 화면당 1개만 */
    btnGold: { backgroundColor: C.gold, borderRadius: 11, paddingVertical: 14, alignItems: 'center' },
    /* 회색 아웃라인 — 탐색형 보조 */
    btnGhost: {
      backgroundColor: C.ghostBg, borderWidth: 1, borderColor: C.ghostBorder,
      borderRadius: 11, paddingVertical: 14, alignItems: 'center',
    },
    btnGhostText: { color: C.body, fontWeight: '700', fontSize: 15 },
    btnDisabled: { backgroundColor: C.line },
    error: { color: C.danger, fontSize: 13, marginTop: SP.sm },
  });
}

// ── 테마 컨텍스트 ──────────────────────────────────────────
const readInitialDark = () => (typeof localStorage !== 'undefined' && localStorage.getItem('mp_theme') === 'dark');

type ThemeValue = { C: Palette; dark: boolean; toggle: () => void };
const ThemeCtx = createContext<ThemeValue>({ C: LIGHT, dark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState<boolean>(readInitialDark);
  const value = useMemo<ThemeValue>(() => ({
    C: dark ? DARK : LIGHT,
    dark,
    toggle: () => setDark((d) => {
      const next = !d;
      if (typeof localStorage !== 'undefined') localStorage.setItem('mp_theme', next ? 'dark' : 'light');
      return next;
    }),
  }), [dark]);
  return createElement(ThemeCtx.Provider, { value }, children);
}

export const useTheme = () => useContext(ThemeCtx);
/** 현재 팔레트 기반 공통 스타일(메모). */
export function useUI() {
  const { C } = useTheme();
  return useMemo(() => makeUI(C), [C]);
}

// ── 하위호환: 기존 모듈스코프 import { C, ui } 를 유지(초기 라이트 값) ──
// 테마 전환은 useTheme()/useUI() 를 쓰는 컴포넌트에만 반영된다.
export const C = LIGHT;
export const ui = makeUI(LIGHT);

/** 등급 배지 색. */
export const gradeColor = (g?: string | null, pal: Palette = LIGHT) =>
  (g ?? 'B').toUpperCase() === 'S' ? pal.gradeS : (g ?? 'B').toUpperCase() === 'A' ? pal.gradeA : pal.gradeB;
