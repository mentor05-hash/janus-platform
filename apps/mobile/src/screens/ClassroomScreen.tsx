import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, SP, useTheme, type Palette } from '../theme';
import { RoomWhiteboardScreen } from './RoomWhiteboardScreen';
import type { RoomSession } from './RoomChatScreen';

type ClassRow = { id: string; title: string; status: string; roomId: string | null };
type JoinResp = { url: string; token: string; role: string; roomId: string };

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  scheduled: { label: '예정', bg: '#EAF0F3', fg: '#5C6E75' },
  live: { label: '진행 중', bg: '#FDEBD8', fg: '#B5651D' },
  ended: { label: '종료', bg: '#E9EDF0', fg: '#8B9BA3' },
  canceled: { label: '취소', bg: '#F6E5E5', fg: '#C0403A' },
};

/** 룸 토큰 payload 디코드(서명 검증은 서버). 참가자 id 추출용. */
function decodeToken(t: string): { participantId?: string } | null {
  try {
    const p = t.split('.')[1];
    return JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/')))));
  } catch { return null; }
}

/** 학생 모바일 강의실 — 등록된 강의 목록 + 입장(판서 열람). 선생님 개설은 웹 전용. */
export function ClassroomScreen() {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [rows, setRows] = useState<ClassRow[] | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  // 입장한 강의(화이트보드 세션)
  const [active, setActive] = useState<{ title: string; session: RoomSession } | null>(null);

  const load = useCallback(async () => {
    try { setRows(await api.get<ClassRow[]>('/classes')); setErr(''); }
    catch (e) { setErr(e instanceof ApiError ? e.message : '강의 목록을 불러오지 못했습니다.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function enter(row: ClassRow) {
    setErr(''); setJoining(row.id);
    try {
      const j = await api.post<JoinResp>(`/classes/${row.id}/join`, {});
      const session: RoomSession = {
        url: j.url,
        token: j.token,
        participantId: decodeToken(j.token)?.participantId ?? '',
        features: { chat: true, whiteboard: true, voice: true },
        session: { restricted: false, state: 'open', opensAt: null, closesAt: null },
      };
      setActive({ title: row.title, session });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '입장하지 못했습니다.');
    } finally { setJoining(null); }
  }

  if (active) {
    return (
      <RoomWhiteboardScreen
        bookingId=""
        title={active.title}
        session={active.session}
        onClose={() => { setActive(null); void load(); }}
      />
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: SP.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}>
      <Text style={styles.title}>강의실</Text>
      <Text style={styles.sub}>등록된 온라인 강의입니다. 선생님이 시작하면 입장해 판서를 함께 봅니다.</Text>

      {err ? <Text style={styles.err}>{err}</Text> : null}

      {rows === null ? (
        <Text style={styles.muted}>불러오는 중…</Text>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyT}>등록된 강의가 없어요</Text>
          <Text style={styles.emptyS}>선생님이 강의에 등록하면 여기에 표시됩니다.</Text>
        </View>
      ) : (
        rows.map((r) => {
          const st = STATUS[r.status] ?? { label: r.status, bg: '#E9EDF0', fg: '#8B9BA3' };
          const canEnter = r.status === 'live' && !!r.roomId;
          return (
            <View key={r.id} style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.cTitle} numberOfLines={2}>{r.title}</Text>
                <View style={[styles.chip, { backgroundColor: st.bg }]}><Text style={[styles.chipT, { color: st.fg }]}>{st.label}</Text></View>
              </View>
              <TouchableOpacity
                style={[styles.btn, !canEnter && styles.btnOff]}
                disabled={!canEnter || joining === r.id}
                onPress={() => enter(r)}
              >
                <Text style={[styles.btnT, !canEnter && styles.btnTOff]}>
                  {joining === r.id ? '입장 중…' : r.status === 'live' ? '입장' : r.status === 'scheduled' ? '시작 전' : '종료됨'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  screen: { flex: 1, padding: SP.lg, backgroundColor: C.bg },
  title: { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
  sub: { color: C.muted, fontSize: 13, marginTop: 4, marginBottom: SP.lg },
  err: { color: '#C0403A', fontSize: 13, marginBottom: SP.md },
  muted: { color: C.muted, fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: SP.xl * 2 },
  emptyT: { color: C.ink, fontWeight: '700', fontSize: 15 },
  emptyS: { color: C.muted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: C.white, borderRadius: R.card, borderWidth: 1, borderColor: C.line, padding: SP.lg, marginBottom: SP.md },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SP.md, marginBottom: SP.md },
  cTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.ink },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipT: { fontSize: 12, fontWeight: '800' },
  btn: { backgroundColor: C.teal, borderRadius: 11, paddingVertical: 13, alignItems: 'center' },
  btnOff: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnTOff: { color: C.muted },
});
