import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Teacher } from '../api';
import { C, R, SP, ui } from '../theme';

type Lists = { fit: string[]; unfit: string[] };

export function ClassifyScreen({ onBack }: { onBack: () => void }) {
  const [lists, setLists] = useState<Lists | null>(null);
  const [names, setNames] = useState<Record<string, Teacher>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  function load() {
    api.get<Lists>('/me/teacher-lists').then(setLists).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<{ data?: Teacher[] } | Teacher[]>('/teachers').then((r) => {
      const list = Array.isArray(r) ? r : (r.data ?? []);
      setNames(Object.fromEntries(list.map((t) => [t.id, t])));
    }).catch(() => {});
  }
  useEffect(load, []);

  async function remove(teacherId: string) {
    setBusy(teacherId); setError('');
    try { await api.del(`/me/teacher-lists/${teacherId}`); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '제거 실패'); }
    finally { setBusy(null); }
  }

  function Row({ id }: { id: string }) {
    const t = names[id];
    return (
      <View style={[ui.card, styles.row]}>
        <View style={styles.avatar}><Text style={styles.avatarT}>{(t?.name ?? '선').slice(0, 1)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{t?.name ?? '선생님'}</Text>
          <Text style={styles.sub}>{t ? `${t.subjects.join('·') || '-'} · ${t.grade}급` : '정보 없음'}</Text>
        </View>
        <TouchableOpacity style={styles.rm} disabled={busy === id} onPress={() => remove(id)}><Text style={styles.rmT}>제거</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ 마이</Text></TouchableOpacity>
      <Text style={ui.h}>선생님 분류</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {lists === null ? <ActivityIndicator color={C.teal} /> : (
        <>
          <Text style={styles.sec}>💚 나와 맞는 선생님 ({lists.fit.length})</Text>
          {lists.fit.length === 0 ? <View style={styles.empty}><Text style={styles.emptyT}>아직 없어요. 선생님 찾기에서 찜(맞는 선생님)으로 추가하세요.</Text></View>
            : lists.fit.map((id) => <Row key={id} id={id} />)}
          <Text style={styles.sec}>🚫 나와 맞지 않는 선생님 ({lists.unfit.length})</Text>
          {lists.unfit.length === 0 ? <View style={styles.empty}><Text style={styles.emptyT}>아직 없어요.</Text></View>
            : lists.unfit.map((id) => <Row key={id} id={id} />)}
          <Text style={styles.note}>맞는 선생님은 검색·자동매칭에서 먼저, 맞지 않는 선생님은 뒤로 보여요. 한 선생님은 한쪽에만 분류되며, 한도는 관리자가 정합니다.</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { color: C.teal, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 11, backgroundColor: C.teal100, alignItems: 'center', justifyContent: 'center' },
  avatarT: { color: C.teal, fontWeight: '800', fontSize: 15 },
  name: { fontSize: 14, fontWeight: '700', color: C.ink },
  sub: { fontSize: 12, color: C.muted, marginTop: 2 },
  rm: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
  rmT: { color: C.muted, fontWeight: '700', fontSize: 13 },
  empty: { backgroundColor: C.lineSoft, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' },
  emptyT: { color: C.caption, fontSize: 12, textAlign: 'center' },
  note: { fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 18 },
});
