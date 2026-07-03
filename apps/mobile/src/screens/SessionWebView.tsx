import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Palette } from '../theme';

/**
 * SessionWebView (웹/베이스) — 웹(expo-web)에서는 SessionHost 의 DOM 세션을 쓰므로
 * 이 컴포넌트는 렌더되지 않는다. 네이티브 구현은 SessionWebView.native.tsx 참조
 * (metro 가 플랫폼별 파일을 선택 → 웹 번들에 react-native-webview 미포함).
 */
export function SessionWebView({ title }: {
  bookingId: string;
  token: string | null;
  kind?: 'chat' | 'whiteboard' | 'both' | 'call';
  title: string;
  onClose: () => void;
}) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  return (
    <View style={s.wrap}>
      <Text style={s.t}>{title}</Text>
      <Text style={s.d}>웹에서는 내장 세션 화면을 사용합니다.</Text>
    </View>
  );
}

const mk = (C: Palette) => StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: C.bg, gap: 8 },
  t: { fontSize: 15, fontWeight: '800', color: C.ink },
  d: { fontSize: 13, color: C.muted, textAlign: 'center' },
});
