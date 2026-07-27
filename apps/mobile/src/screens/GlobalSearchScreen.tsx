import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, SP, useTheme, type Palette } from '../theme';

type Hit = { type: 'lecture' | 'material' | 'community' | 'teacher'; id: string; title: string; subtitle?: string | null; subject?: string | null };
type Result = { q: string; total: number; groups: Record<string, Hit[]> };

const GROUP: Record<string, { label: string; icon: string; tab: string }> = {
  teacher: { label: '선생님', icon: '◇', tab: 'a' },
  lecture: { label: '강좌', icon: '▶', tab: 'r' },
  community: { label: '커뮤니티 Q&A', icon: '◫', tab: 'f' },
  material: { label: '자료실', icon: '▦', tab: 'e' },
};
const ORDER = ['teacher', 'lecture', 'community', 'material'];

/** 모바일 전역 통합검색 — 강좌·자료·커뮤니티·선생님을 한 번에. 결과 탭으로 이동. */
export function GlobalSearchScreen({ onClose, goTab }: { onClose: () => void; goTab: (t: string) => void }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [term, setTerm] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    const q = term.trim();
    if (!q) { setResult(null); return; }
    setLoading(true); setError('');
    try {
      const r = await api.get<Result>(`/search?q=${encodeURIComponent(q)}`);
      setResult(r);
    } catch (e) { setError(e instanceof ApiError ? e.message : '검색 실패'); }
    finally { setLoading(false); }
  }

  return (
    <View style={s.wrap}>
      <View style={s.searchRow}>
        <TextInput
          style={s.input}
          value={term}
          onChangeText={setTerm}
          placeholder="강좌·자료·Q&A·선생님 검색"
          placeholderTextColor={C.muted}
          returnKeyType="search"
          onSubmitEditing={run}
          autoFocus
        />
        <TouchableOpacity style={s.btn} onPress={run}><Text style={s.btnT}>검색</Text></TouchableOpacity>
        <TouchableOpacity style={s.close} onPress={onClose}><Text style={s.closeT}>✕</Text></TouchableOpacity>
      </View>

      {error ? <Text style={s.err}>{error}</Text> : null}
      <ScrollView contentContainerStyle={{ padding: SP.lg, gap: SP.md }}>
        {loading ? <Text style={s.muted}>검색 중…</Text>
          : !result ? <Text style={s.muted}>검색어를 입력하면 강좌·자료·커뮤니티·선생님에서 함께 찾아드려요.</Text>
          : result.total === 0 ? <Text style={s.muted}>‘{result.q}’ 결과가 없어요.</Text>
          : (
            <>
              <Text style={s.summary}>‘{result.q}’ 결과 {result.total}건</Text>
              {ORDER.filter((g) => result.groups[g]?.length).map((g) => (
                <View key={g} style={s.card}>
                  <Text style={s.cardTitle}>{GROUP[g].icon} {GROUP[g].label} {result.groups[g].length}</Text>
                  {result.groups[g].map((h) => (
                    <TouchableOpacity key={h.id} style={s.row} onPress={() => { goTab(GROUP[g].tab); onClose(); }}>
                      {h.subject ? <Text style={s.chip}>{h.subject}</Text> : null}
                      <Text style={s.rowTitle} numberOfLines={1}>{h.title}</Text>
                      {h.subtitle ? <Text style={s.rowSub} numberOfLines={1}>{h.subtitle}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </>
          )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, padding: SP.lg, borderBottomWidth: 1, borderBottomColor: C.line },
  input: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: SP.md, paddingVertical: 8, color: C.ink, backgroundColor: C.white, fontSize: 14 },
  btn: { backgroundColor: C.blue, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 9 },
  btnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  close: { paddingHorizontal: 6, paddingVertical: 6 },
  closeT: { color: C.muted, fontSize: 18 },
  err: { color: C.danger, paddingHorizontal: SP.lg, paddingTop: SP.sm },
  muted: { color: C.muted, fontSize: 13.5, lineHeight: 20 },
  summary: { color: C.muted, fontSize: 12.5 },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: R.card, padding: SP.md },
  cardTitle: { fontSize: 13, fontWeight: '800', color: C.muted, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line },
  chip: { fontSize: 11, color: C.blue, backgroundColor: C.blueSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: C.ink },
  rowSub: { fontSize: 12, color: C.muted },
});
