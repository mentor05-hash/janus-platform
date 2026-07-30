import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Teacher } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';

type Note = {
  bookingId: string;
  teacherId: string;
  consultType: string | null;
  coreSummary: string | null;
  homework: string | null;
  futureDir: string | null;
  createdAt: string;
};
const KST = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' });

export function RecordsScreen({ onBack, backLabel = '‹ 뒤로' }: { onBack: () => void; backLabel?: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Note[]>('/me/notes').then(setNotes).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<{ data?: Teacher[] } | Teacher[]>('/teachers').then((r) => {
      const list = Array.isArray(r) ? r : (r.data ?? []);
      setNames(Object.fromEntries(list.map((t) => [t.id, t.name])));
    }).catch(() => {});
  }, []);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>{backLabel}</Text></TouchableOpacity>
      <Text style={ui.h}>내 상담 기록</Text>
      <Text style={styles.note}>공개된 핵심 요약·숙제·향후 방향만 보여요. (선생님 내부 메모는 비공개, 완료된 상담만 열람)</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {notes === null ? <ActivityIndicator color={C.teal} style={{ marginTop: 20 }} /> : notes.length === 0 ? (
        <View style={[ui.card, { paddingVertical: 20, marginTop: 12 }]}><Text style={styles.emptyT}>아직 공개된 상담 기록이 없어요.</Text></View>
      ) : (
        <View style={{ marginTop: 12 }}>
          {notes.map((n) => (
            <View key={n.bookingId} style={styles.tl}>
              <View style={styles.dot} />
              <Text style={styles.date}>{KST(n.createdAt)} · {n.consultType ?? '상담'}{names[n.teacherId] ? ` · ${names[n.teacherId]} 선생님` : ''}</Text>
              {n.coreSummary ? (<><Text style={styles.tt}>핵심 요약</Text><Text style={styles.bk}>{n.coreSummary}</Text></>) : null}
              {n.homework ? (<><Text style={styles.tt}>숙제</Text><Text style={styles.bk}>{n.homework}</Text></>) : null}
              {n.futureDir ? (<><Text style={styles.tt}>향후 방향</Text><Text style={styles.bk}>{n.futureDir}</Text></>) : null}
              {!n.coreSummary && !n.homework && !n.futureDir ? <Text style={styles.bk}>기록 내용이 없어요.</Text> : null}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  note: { fontSize: 12, color: C.muted, lineHeight: 18 },
  emptyT: { color: C.muted, fontSize: 13, textAlign: 'center' },
  tl: { borderLeftWidth: 2, borderLeftColor: C.line, marginLeft: 6, paddingLeft: 16, paddingBottom: 16, position: 'relative' },
  dot: { position: 'absolute', left: -6, top: 3, width: 10, height: 10, borderRadius: 5, backgroundColor: C.teal500 },
  date: { fontSize: 12, fontWeight: '800', color: C.caption },
  tt: { fontSize: 11, fontWeight: '800', color: C.teal, marginTop: 8 },
  bk: { fontSize: 13, color: C.ink, marginTop: 3, lineHeight: 19 },
});
