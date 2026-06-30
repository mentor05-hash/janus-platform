/**
 * 모바일 디자인 토큰 — hi-fi 핸드오프(Itall Foundations / Student Screens) 기준.
 * 웹 tokens.css 와 동일한 팔레트를 RN 값으로 정리.
 */
import { StyleSheet } from 'react-native';

export const C = {
  // 브랜드 teal
  teal: '#0E5C7C',
  teal900: '#0A4A64',
  teal500: '#1A7FA8',
  teal100: '#DCECF3',
  teal50: '#F0F7FA',
  // 뉴트럴
  ink: '#16242B',
  body: '#374151',
  muted: '#52656D',
  caption: '#94A3AB',
  line: '#E7ECEF',
  lineSoft: '#EEF2F4',
  inputBorder: '#CBD5DA',
  bg: '#F2F4F6',
  fill: '#F6F8FA',
  white: '#FFFFFF',
  // 상태칩 (텍스트 / soft 배경)
  newC: '#2563EB', newBg: '#EFF4FE',
  confirmed: '#B86C04', confirmedBg: '#FEF6E7',
  done: '#15803D', doneBg: '#ECF8EF',
  mutedChip: '#52656D', mutedChipBg: '#F1F5F7',
  danger: '#DC2626', dangerBg: '#FEF2F2', dangerBorder: '#F0C6C6',
  // 등급
  gradeS: '#C99A2E', gradeA: '#0E5C7C', gradeB: '#64748B',
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

/** 화면 공통 스타일(타이틀·라벨·입력·카드·기본버튼). */
export const ui = StyleSheet.create({
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
  btnText: { color: C.white, fontWeight: '700', fontSize: 15 },
  btnDisabled: { backgroundColor: '#E2E8EB' },
  error: { color: C.danger, fontSize: 13, marginTop: SP.sm },
});

/** 등급 배지 색. */
export const gradeColor = (g?: string | null) =>
  (g ?? 'B').toUpperCase() === 'S' ? C.gradeS : (g ?? 'B').toUpperCase() === 'A' ? C.gradeA : C.gradeB;
