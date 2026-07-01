import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { C, R, SP, ui } from '../theme';

type Material = {
  id: string; title: string; description: string | null; subject: string | null; category: string | null;
  visibility: string; teacherName: string | null; centerName: string | null;
  filename: string | null; size: number | null; downloadUrl: string | null;
};
const sizeStr = (n: number | null) => (n == null ? '' : n < 1048576 ? `${Math.round(n / 1024)}KB` : `${(n / 1048576).toFixed(1)}MB`);

/** 미리보기: 웹에서 파일을 받아 텍스트/이미지 인라인 표시. */
async function fetchPreview(path: string): Promise<{ kind: 'text' | 'image' | 'none'; text?: string; url?: string }> {
  const tok = (typeof localStorage !== 'undefined' && localStorage.getItem('itall_access')) || '';
  const res = await fetch('/api/v1' + path, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
  const ct = res.headers.get('Content-Type') ?? '';
  const blob = await res.blob();
  if (ct.startsWith('image/')) return { kind: 'image', url: URL.createObjectURL(blob) };
  if (ct.startsWith('text/')) return { kind: 'text', text: await blob.text() };
  return { kind: 'none' };
}

export function MaterialsScreen() {
  const [rows, setRows] = useState<Material[] | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [category, setCategory] = useState('전체');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [prev, setPrev] = useState<Record<string, { kind: string; text?: string; url?: string }>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data?: Material[] } | Material[]>('/materials').then((r) => setRows(Array.isArray(r) ? r : (r.data ?? []))).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<{ name: string }[]>('/categories?kind=material').then((r) => setCats(r.map((c) => c.name))).catch(() => {});
  }, []);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (rows ?? []).filter((m) => (category === '전체' || m.category === category) && (!kw || m.title.toLowerCase().includes(kw) || (m.description ?? '').toLowerCase().includes(kw)));
  }, [rows, category, q]);
  const isWeb = typeof document !== 'undefined';

  async function togglePreview(m: Material) {
    if (open === m.id) { setOpen(null); return; }
    setOpen(m.id);
    if (!prev[m.id] && m.downloadUrl && isWeb) {
      try { const r = await fetchPreview(m.downloadUrl); setPrev((p) => ({ ...p, [m.id]: r })); }
      catch { setPrev((p) => ({ ...p, [m.id]: { kind: 'none' } })); }
    }
  }
  async function download(m: Material) {
    if (!m.downloadUrl) return;
    try { await api.downloadWebPath(m.downloadUrl, m.filename ?? m.title); } catch (e) { setError(e instanceof ApiError ? e.message : '다운로드 실패'); }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>자료실</Text>
      <TextInput style={[ui.input, { marginTop: 8 }]} value={q} onChangeText={setQ} placeholder="제목·설명 검색" placeholderTextColor={C.caption} />
      <View style={styles.pillRow}>
        {['전체', ...cats].map((c) => (
          <TouchableOpacity key={c} style={[styles.pill, category === c && styles.pillOn]} onPress={() => setCategory(c)}><Text style={[styles.pillT, category === c && { color: C.white }]}>{c}</Text></TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={ui.error}>{error}</Text> : null}
      {rows === null ? <Text style={ui.sub}>불러오는 중…</Text> : list.length === 0 ? <Text style={ui.sub}>조건에 맞는 자료가 없어요.</Text> : list.map((m) => (
        <View key={m.id} style={[ui.card, { marginBottom: 8 }]}>
          <View style={styles.tagRow}>
            {m.category ? <View style={styles.tag}><Text style={styles.tagT}>{m.category}</Text></View> : null}
            {m.subject ? <View style={styles.tag}><Text style={styles.tagT}>{m.subject}</Text></View> : null}
            <View style={[styles.tag, { backgroundColor: m.visibility === 'public' ? C.doneBg : C.confirmedBg }]}><Text style={[styles.tagT, { color: m.visibility === 'public' ? C.done : C.confirmed }]}>{m.visibility === 'public' ? '전체 공개' : '우리 센터'}</Text></View>
          </View>
          <Text style={styles.title}>{m.title}</Text>
          {m.description ? <Text style={styles.desc}>{m.description}</Text> : null}
          <Text style={styles.meta}>{m.teacherName ?? '선생님'}{m.centerName ? ` · ${m.centerName}` : ''}{m.size ? ` · ${sizeStr(m.size)}` : ''}</Text>
          {m.downloadUrl ? (
            <>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.prevBtn} onPress={() => togglePreview(m)}><Text style={styles.prevT}>{open === m.id ? '미리보기 닫기' : '👁 미리보기'}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.dlBtn} onPress={() => download(m)}><Text style={styles.dlT}>⬇ 다운로드</Text></TouchableOpacity>
              </View>
              {open === m.id && (
                <View style={styles.preview}>
                  {!isWeb ? <Text style={styles.desc}>미리보기는 웹에서 지원됩니다.</Text> :
                    !prev[m.id] ? <Text style={styles.desc}>불러오는 중…</Text> :
                    prev[m.id].kind === 'image' ? <Image source={{ uri: prev[m.id].url }} style={{ width: '100%', height: 220, resizeMode: 'contain' }} /> :
                    prev[m.id].kind === 'text' ? <Text style={styles.previewText}>{prev[m.id].text}</Text> :
                    <Text style={styles.desc}>이 형식은 미리보기를 지원하지 않아요. 다운로드해 확인하세요.</Text>}
                </View>
              )}
            </>
          ) : <Text style={styles.meta}>첨부 없음</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4 },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingVertical: 4, paddingHorizontal: 12, backgroundColor: C.white },
  pillOn: { backgroundColor: C.teal, borderColor: C.teal },
  pillT: { color: C.muted, fontWeight: '700', fontSize: 12, lineHeight: 16 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  tag: { backgroundColor: C.fill, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tagT: { fontSize: 11, fontWeight: '700', color: C.muted },
  title: { fontSize: 15, fontWeight: '700', color: C.ink },
  desc: { fontSize: 13, color: C.muted, marginTop: 4 },
  meta: { fontSize: 12, color: C.muted, marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  prevBtn: { flex: 1, borderWidth: 1, borderColor: C.teal, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  prevT: { color: C.teal, fontWeight: '800', fontSize: 13 },
  dlBtn: { flex: 1, backgroundColor: C.teal, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  dlT: { color: C.white, fontWeight: '800', fontSize: 13 },
  preview: { marginTop: 10, backgroundColor: C.fill, borderRadius: R.md, padding: 10, maxHeight: 260 },
  previewText: { fontSize: 12, color: C.ink, lineHeight: 18 },
});
