import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { C, R, SP, ui } from '../theme';

type Material = {
  id: string; title: string; description: string | null; subject: string | null;
  visibility: string; teacherName: string | null; centerName: string | null;
  filename: string | null; size: number | null; downloadUrl: string | null;
};
const SUBJECTS = ['전체', '국어', '수학', '영어', '탐구'];
const sizeStr = (n: number | null) => (n == null ? '' : n < 1048576 ? `${Math.round(n / 1024)}KB` : `${(n / 1048576).toFixed(1)}MB`);

export function MaterialsScreen() {
  const [rows, setRows] = useState<Material[] | null>(null);
  const [subject, setSubject] = useState('전체');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get<{ data?: Material[] } | Material[]>('/materials')
      .then((r) => setRows(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);

  const list = useMemo(() => (rows ?? []).filter((m) => subject === '전체' || m.subject === subject), [rows, subject]);
  const isWeb = typeof document !== 'undefined';

  async function download(m: Material) {
    if (!m.downloadUrl) return;
    setError(''); setMsg('');
    try { await api.downloadWebPath(m.downloadUrl, m.filename ?? m.title); }
    catch (e) { setError(e instanceof ApiError ? e.message : '다운로드 실패'); }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>자료실</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>선생님이 올린 학습자료(공개 자료 및 우리 센터 자료)를 다운로드합니다.</Text>

      <View style={styles.pills}>
        {SUBJECTS.map((s) => (
          <TouchableOpacity key={s} style={[styles.pill, subject === s && styles.pillOn]} onPress={() => setSubject(s)}>
            <Text style={[styles.pillT, subject === s && { color: C.white }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {rows === null ? <Text style={ui.sub}>불러오는 중…</Text> : list.length === 0 ? <Text style={ui.sub}>열람 가능한 자료가 없어요.</Text> : list.map((m) => (
        <View key={m.id} style={[ui.card, { marginBottom: 8 }]}>
          <View style={styles.tagRow}>
            {m.subject ? <View style={styles.tag}><Text style={styles.tagT}>{m.subject}</Text></View> : null}
            <View style={[styles.tag, { backgroundColor: m.visibility === 'public' ? C.doneBg : C.confirmedBg }]}>
              <Text style={[styles.tagT, { color: m.visibility === 'public' ? C.done : C.confirmed }]}>{m.visibility === 'public' ? '전체 공개' : '우리 센터'}</Text>
            </View>
          </View>
          <Text style={styles.title}>{m.title}</Text>
          {m.description ? <Text style={styles.desc}>{m.description}</Text> : null}
          <Text style={styles.meta}>{m.teacherName ?? '선생님'}{m.centerName ? ` · ${m.centerName}` : ''}{m.size ? ` · ${sizeStr(m.size)}` : ''}</Text>
          {m.downloadUrl ? (
            <TouchableOpacity style={styles.dlBtn} onPress={() => download(m)}>
              <Text style={styles.dlT}>{isWeb ? '⬇ 다운로드' : '⬇ 다운로드(웹에서 지원)'}{m.filename ? ` · ${m.filename}` : ''}</Text>
            </TouchableOpacity>
          ) : <Text style={styles.meta}>첨부 없음</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: SP.md },
  pill: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 13 },
  pillOn: { backgroundColor: C.teal, borderColor: C.teal },
  pillT: { color: C.muted, fontWeight: '700', fontSize: 13 },
  ok: { color: C.done, fontSize: 13, marginBottom: 8, fontWeight: '600' },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  tag: { backgroundColor: C.fill, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tagT: { fontSize: 11, fontWeight: '700', color: C.muted },
  title: { fontSize: 15, fontWeight: '700', color: C.ink },
  desc: { fontSize: 13, color: C.muted, marginTop: 4 },
  meta: { fontSize: 12, color: C.muted, marginTop: 4 },
  dlBtn: { marginTop: 10, backgroundColor: C.teal, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  dlT: { color: C.white, fontWeight: '800', fontSize: 13 },
});
