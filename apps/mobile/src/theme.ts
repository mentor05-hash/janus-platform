/**
 * 모바일 디자인 토큰 — hi-fi 핸드오프(Itall Foundations / Student Screens) 기준.
 * 웹 tokens.css 와 동일한 팔레트를 RN 값으로 정리. 라이트/다크 런타임 전환 지원.
 */
import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

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
};

export const LIGHT: Palette = {
  teal: '#0E5C7C', teal900: '#0A4A64', teal500: '#1A7FA8', teal100: '#DCECF3', teal50: '#F0F7FA',
  ink: '#16242B', body: '#374151', muted: '#52656D', caption: '#94A3AB',
  line: '#E7ECEF', lineSoft: '#EEF2F4', inputBorder: '#CBD5DA',
  bg: '#F2F4F6', fill: '#F6F8FA', white: '#FFFFFF',
  newC: '#2563EB', newBg: '#EFF4FE',
  confirmed: '#B86C04', confirmedBg: '#FEF6E7',
  done: '#15803D', doneBg: '#ECF8EF',
  mutedChip: '#52656D', mutedChipBg: '#F1F5F7',
  danger: '#DC2626', dangerBg: '#FEF2F2', dangerBorder: '#F0C6C6',
  gradeS: '#C99A2E', gradeA: '#0E5C7C', gradeB: '#64748B',
};

// 다크: 브랜드 teal·상태 텍스트색 유지, 표면/텍스트/라인/칩 배경만 반전.
export const DARK: Palette = {
  teal: '#2A9BC4', teal900: '#1A7FA8', teal500: '#2A9BC4', teal100: '#16414A', teal50: '#123138',
  ink: '#EEF2F4', body: '#D3DBE0', muted: '#9FB0B8', caption: '#7C8B93',
  line: '#26333A', lineSoft: '#202B31', inputBorder: '#33434B',
  bg: '#0F181C', fill: '#1D2C33', white: '#17242A',
  newC: '#6FA8F5', newBg: '#14263F',
  confirmed: '#E0A52E', confirmedBg: '#2E2410',
  done: '#4ADE80', doneBg: '#12281A',
  mutedChip: '#9FB0B8', mutedChipBg: '#202B31',
  danger: '#F27070', dangerBg: '#2E1618', dangerBorder: '#5A2A2C',
  gradeS: '#E0B53D', gradeA: '#2A9BC4', gradeB: '#8B9BA3',
};

export const R = { sm: 7, md: 9, card: 14, pill: 999 };
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

/** 카드 그림자(플랫) — iOS/Android. */
export const shadowCard = {
  shadowColor: '#10242B',
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
    btnDisabled: { backgroundColor: '#E2E8EB' },
    error: { color: C.danger, fontSize: 13, marginTop: SP.sm },
  });
}

// ── 테마 컨텍스트 ──────────────────────────────────────────
const readInitialDark = () => (typeof localStorage !== 'undefined' && localStorage.getItem('itall_theme') === 'dark');

type ThemeValue = { C: Palette; dark: boolean; toggle: () => void };
const ThemeCtx = createContext<ThemeValue>({ C: LIGHT, dark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState<boolean>(readInitialDark);
  const value = useMemo<ThemeValue>(() => ({
    C: dark ? DARK : LIGHT,
    dark,
    toggle: () => setDark((d) => {
      const next = !d;
      if (typeof localStorage !== 'undefined') localStorage.setItem('itall_theme', next ? 'dark' : 'light');
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
