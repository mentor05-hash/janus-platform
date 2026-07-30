import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI, type Palette } from '../theme';
import { useWebBack } from '../webBack';

type Item = { bookingId: string; sentAt: string | null; openedAt: string | null; startAt: string | null; teacherName: string | null; category: string | null };
type Detail = { bookingId: string; covered: string[]; diagnosis: string; nextActions: string[]; sentAt: string | null };
const KST = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** R4 파리티 — 학생: 발송된 상담 요약 리포트 열람(첫 열람 시 서버가 opened_at 스탬프). */
export function ReportsScreen({ onBack, backLabel = '‹ 뒤로' }: { onBack: () => void; backLabel?: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [det, setDet] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Item[]>('/media/reports/student').then((r) => setItems(Array.isArray(r) ? r : [])).catch((e) => { setItems([]); setError(e instanceof ApiError ? e.message : '조회 실패'); });
  }, []);
  useWebBack(det !== null, () => setDet(null));

  async function open(it: Item) {
    setLoading(true); setError('');
    try {
      const d = await api.get<Detail>(`/media/reports/${it.bookingId}`);
      setDet(d);
      // 첫 열람이면 NEW 배지 즉시 제거(서버 opened_at 스탬프와 동기)
      setItems((p) => (p ?? []).map((x) => (x.bookingId === it.bookingId ? { ...x, openedAt: x.openedAt ?? new Date().toISOString() } : x)));
    } catch (e) { setError(e instanceof ApiError ? e.message : '리포트를 불러오지 못했어요.'); }
    finally { setLoading(false); }
  }

  if (det) {
    return (
      <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity onPress={() => setDet(null)}><Text style={styles.back}>‹ 리포트 목록</Text></TouchableOpacity>
        <Text style={ui.h}>📋 상담 요약 리포트</Text>
        <Text style={styles.note}>도착 {KST(det.sentAt)}</Text>
        <View style={[ui.card, { marginTop: SP.md }]}>
          <Text style={styles.secT}>오늘 다룬 내용</Text>
          {det.covered.map((c, i) => <Text key={i} style={styles.li}>• {c}</Text>)}
          <Text style={[styles.secT, { marginTop: 14 }]}>진단·관찰</Text>
          <Text style={styles.body}>{det.diagnosis}</Text>
          <Text style={[styles.secT, { marginTop: 14 }]}>다음 액션 ✅</Text>
          {det.nextActions.map((c, i) => <Text key={i} style={styles.li}>• {c}</Text>)}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>{backLabel}</Text></TouchableOpacity>
      <Text style={ui.h}>상담 리포트</Text>
      <Text style={styles.note}>녹음 동의한 상담의 요약 리포트예요. 선생님이 검수한 뒤에 도착합니다.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={C.teal} style={{ marginTop: 12 }} /> : null}
      {items === null ? <ActivityIndicator color={C.teal} style={{ marginTop: 20 }} /> : items.length === 0 ? (
        <View style={[ui.card, { paddingVertical: 20, marginTop: 12 }]}><Text style={styles.emptyT}>도착한 리포트가 아직 없어요.</Text></View>
      ) : (
        <View style={{ marginTop: 12 }}>
          {items.map((it) => (
            <TouchableOpacity key={it.bookingId} style={[ui.card, styles.row]} onPress={() => void open(it)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowT}>{it.teacherName ?? '선생님'} 선생님</Text>
                <Text style={styles.rowSub}>{KST(it.startAt)}{it.category ? ` · ${it.category}` : ''}</Text>
              </View>
              {!it.openedAt ? <View style={styles.newBadge}><Text style={styles.newT}>NEW</Text></View> : <Text style={styles.arrow}>›</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  note: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 2 },
  emptyT: { color: C.muted, fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rowT: { fontSize: 14, fontWeight: '800', color: C.ink },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  newBadge: { backgroundColor: C.danger, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  newT: { color: '#fff', fontSize: 10, fontWeight: '800' },
  arrow: { color: C.caption, fontSize: 18 },
  secT: { fontSize: 12, fontWeight: '800', color: C.teal },
  li: { fontSize: 13, color: C.ink, lineHeight: 20, marginTop: 4 },
  body: { fontSize: 13, color: C.ink, lineHeight: 20, marginTop: 4 },
});
