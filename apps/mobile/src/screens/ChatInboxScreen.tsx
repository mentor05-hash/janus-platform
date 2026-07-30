import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, Me } from '../api';
import { SP, useTheme, useUI, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { SessionChatScreen } from './SessionChatScreen';

/* 채팅 인박스(카톡형) — 웹 ChatInboxPage 파리티. 대화가 있는 상담을 최신 메시지순으로,
 * 미읽음 배지·미리보기·원탭 진입. 학생·선생님 공용('놓치지 않게' 원칙의 목록 축). */

type Row = {
  bookingId: string; counterpartId: string | null; counterpartName: string;
  mode: string | null; status: string | null; startAt: string | null;
  lastAt: string; lastPreview: string; lastMine: boolean; unread: number;
};

const MODE_ICON: Record<string, string> = { chat: '💬', zoom: '📹', hand: '✍️', offline: '🏫' };
const T = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const hm = d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '어제';
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function ChatInboxScreen({ onBack, backLabel = '‹ 뒤로' }: { onBack: () => void; backLabel?: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState('상담 채팅');

  const load = useCallback(() => {
    api.get<Row[]>('/chat/inbox').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => {
    load();
    api.me().then((m: Me) => setMyId(m.id)).catch(() => {});
    // 웹 런타임 — 화면 복귀 시 갱신(읽음 반영)
    const onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') load(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    const iv = setInterval(load, 30_000);
    return () => { clearInterval(iv); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); };
  }, [load]);
  useWebBack(true, onBack);

  if (chatId && myId) {
    return <SessionChatScreen bookingId={chatId} myId={myId} title={chatTitle} onClose={() => { setChatId(null); load(); }} />;
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.head}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>{backLabel}</Text></TouchableOpacity>
        <Text style={ui.h}>채팅</Text>
      </View>
      <Text style={styles.sub}>상담 대화를 최신순으로 모아 봅니다. 안 읽은 대화는 배지로 표시돼요.</Text>
      {rows === null ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={C.teal} /></View>
      ) : rows.length === 0 ? (
        <View style={[ui.card, { marginTop: SP.md }]}><Text style={ui.sub}>아직 대화가 없어요 — 상담이 시작되면 여기에 모입니다.</Text></View>
      ) : rows.map((r) => (
        <TouchableOpacity
          key={r.bookingId}
          style={[ui.card, styles.row, r.unread > 0 && { backgroundColor: C.teal50 }]}
          activeOpacity={0.7}
          onPress={() => { setChatTitle(`${r.counterpartName}님과의 채팅`); setChatId(r.bookingId); }}
        >
          <Text style={styles.ic}>{MODE_ICON[r.mode ?? ''] ?? '💬'}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.name}>{r.counterpartName}</Text>
              {r.status === 'cancelled' && <Text style={styles.cancel}>취소됨</Text>}
            </View>
            <Text style={styles.preview} numberOfLines={1}>{r.lastMine ? '나: ' : ''}{r.lastPreview || '(내용 없음)'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={styles.time}>{T(r.lastAt)}</Text>
            {r.unread > 0 && (
              <View style={styles.badge}><Text style={styles.badgeT}>{r.unread > 99 ? '99+' : r.unread}</Text></View>
            )}
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { color: C.teal, fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, color: C.muted, marginTop: 4, marginBottom: SP.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  ic: { fontSize: 22 },
  name: { fontSize: 14, fontWeight: '800', color: C.ink },
  cancel: { fontSize: 11, color: C.caption },
  preview: { fontSize: 12.5, color: C.muted, marginTop: 2 },
  time: { fontSize: 11, color: C.caption },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 999, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  badgeT: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
