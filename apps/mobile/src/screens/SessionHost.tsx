import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { api } from '../api';
import { R, useTheme, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { ChatScreen } from './ChatScreen';
import { WhiteboardScreen } from './WhiteboardScreen';

/** 열린 상담 세션(§선생님 모바일 ③다중 상담 동시 진행). */
export type OpenSession = { id: string; title: string; sub?: string };
type State = { open: OpenSession[]; activeId: string | null };

/** 여러 상담을 동시에 열어두고 전환하는 세션 매니저. TeacherSessions/Today 가 공유. */
export type Panel = 'chat' | 'both' | 'wb';
export function useSessionHost() {
  const [st, setSt] = useState<State>({ open: [], activeId: null });
  const [panel, setPanel] = useState<Panel>('both');
  const openSession = useCallback((sess: OpenSession, prefer?: Panel) => {
    if (prefer) setPanel(prefer);
    setSt((s) => (s.open.some((x) => x.id === sess.id)
      ? { ...s, activeId: sess.id }
      : { open: [...s.open, sess], activeId: sess.id }));
  }, []);
  const close = useCallback((id: string) => {
    setSt((s) => {
      const open = s.open.filter((x) => x.id !== id);
      const activeId = s.activeId === id ? (open[open.length - 1]?.id ?? null) : s.activeId;
      return { open, activeId };
    });
  }, []);
  const setActiveId = useCallback((id: string) => setSt((s) => ({ ...s, activeId: id })), []);
  const minimize = useCallback(() => setSt((s) => ({ ...s, activeId: null })), []); // 목록으로(세션 유지)
  const closeAll = useCallback(() => setSt({ open: [], activeId: null }), []);
  return { open: st.open, activeId: st.activeId, panel, setPanel, openSession, close, setActiveId, minimize, closeAll };
}
export type Host = ReturnType<typeof useSessionHost>;

/**
 * ③다중 세션 독 + ④통합 상담 화면(채팅+화이트보드+음성 한 화면).
 * 태블릿(넓은 폭): 통합 분할(채팅|화이트보드) 기본, 세그먼트로 한쪽 집중 가능.
 * 폰: 채팅/화이트보드 탭 전환.
 */
export function SessionHost({ host, myId, onClosed }: { host: Host; myId: string; onClosed?: () => void }) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const wide = useWindowDimensions().width >= 900;
  const { panel, setPanel } = host;
  const [unread, setUnread] = useState<Record<string, number>>({});
  const { open, activeId } = host;
  const active = open.find((o) => o.id === activeId) ?? null;

  // 활성 세션 back → 목록으로(세션은 트레이에 유지). 개별 종료는 칩 ✕.
  useWebBack(!!active, () => host.minimize());

  const closeOne = useCallback((id: string) => {
    host.close(id);
    onClosed?.();
  }, [host, onClosed]);

  useEffect(() => {
    if (!open.length) return;
    let live = true;
    const tick = () => api.get<Record<string, number>>('/chat/unread').then((u) => { if (live) setUnread(u); }).catch(() => {});
    tick();
    const t = setInterval(tick, 8000);
    return () => { live = false; clearInterval(t); };
  }, [open.length, activeId]);

  if (!active) return null;
  const showBoth = wide && panel === 'both';
  // 폰에서는 통합 분할 대신 채팅 기본
  const single: 'chat' | 'wb' = panel === 'wb' ? 'wb' : 'chat';

  return (
    <View style={s.wrap}>
      {/* 세션 독 — 열린 상담 전환 */}
      <View style={s.dock}>
        <TouchableOpacity style={s.homeBtn} onPress={() => host.minimize()} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={s.homeT}>⌂ 목록</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dockRow}>
          {open.map((o) => {
            const on = o.id === activeId;
            const u = unread[o.id] ?? 0;
            return (
              <TouchableOpacity key={o.id} style={[s.chip, on && s.chipOn]} activeOpacity={0.8} onPress={() => host.setActiveId(o.id)}>
                <Text numberOfLines={1} style={[s.chipT, on && s.chipTOn]}>{o.title}{u > 0 ? ` · ${u}` : ''}</Text>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} onPress={() => closeOne(o.id)}>
                  <Text style={[s.chipX, on && s.chipTOn]}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {/* 패널 세그먼트 */}
        <View style={s.seg}>
          {(wide ? (['chat', 'both', 'wb'] as const) : (['chat', 'wb'] as const)).map((p) => (
            <TouchableOpacity key={p} style={[s.segItem, (wide ? panel === p : single === p) && s.segOn]} onPress={() => setPanel(p)}>
              <Text style={[s.segT, (wide ? panel === p : single === p) && s.segTOn]}>{p === 'chat' ? '채팅' : p === 'wb' ? '보드' : '통합'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 본문 — 통합 분할 또는 단일 */}
      {showBoth ? (
        <View style={s.split}>
          <View style={s.half}><ChatScreen key={`c-${active.id}`} bookingId={active.id} myId={myId} title={active.title} onClose={() => closeOne(active.id)} embedded /></View>
          <View style={s.divider} />
          <View style={s.half}><WhiteboardScreen key={`w-${active.id}`} bookingId={active.id} title={active.title} onClose={() => closeOne(active.id)} embedded /></View>
        </View>
      ) : single === 'wb' ? (
        <WhiteboardScreen key={`w-${active.id}`} bookingId={active.id} title={active.title} onClose={() => closeOne(active.id)} embedded />
      ) : (
        <ChatScreen key={`c-${active.id}`} bookingId={active.id} myId={myId} title={active.title} onClose={() => closeOne(active.id)} embedded />
      )}
    </View>
  );
}

const mk = (C: Palette) => StyleSheet.create({
  wrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: C.bg, zIndex: 100 },
  dock: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.white },
  homeBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: C.line },
  homeT: { color: C.ink, fontWeight: '800', fontSize: 12 },
  dockRow: { gap: 8, alignItems: 'center', paddingRight: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 200, paddingLeft: 12, paddingRight: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: C.lineSoft },
  chipOn: { backgroundColor: C.teal },
  chipT: { color: C.ink, fontWeight: '700', fontSize: 12, flexShrink: 1 },
  chipTOn: { color: '#fff' },
  chipX: { color: C.caption, fontSize: 11, fontWeight: '800' },
  seg: { flexDirection: 'row', borderRadius: R.sm, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  segItem: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: C.bg },
  segOn: { backgroundColor: C.teal },
  segT: { color: C.caption, fontWeight: '700', fontSize: 12 },
  segTOn: { color: '#fff' },
  split: { flex: 1, flexDirection: 'row' },
  half: { flex: 1 },
  divider: { width: 1, backgroundColor: C.line },
});
