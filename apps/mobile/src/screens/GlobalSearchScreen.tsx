import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { showAlert } from '../lib/alertHost';
import { resolveWebPath } from '@mentoring/nav';
import { R, SP, useTheme, type Palette } from '../theme';

/** `href` 는 서버가 정하는 목적지다(API `search.hrefs.ts`) — 웹과 같은 값을 그대로 받는다. */
type Hit = { type: 'lecture' | 'material' | 'community' | 'teacher'; id: string; title: string; subtitle?: string | null; subject?: string | null; href?: string };
type Result = { q: string; total: number; groups: Record<string, Hit[]> };

const GROUP: Record<string, { label: string; icon: string }> = {
  teacher: { label: '선생님', icon: '◇' },
  lecture: { label: '강좌', icon: '▶' },
  community: { label: '커뮤니티 Q&A', icon: '◫' },
  material: { label: '자료실', icon: '▦' },
};
const ORDER = ['teacher', 'lecture', 'community', 'material'];

/**
 * 모바일 전역 통합검색 — 강좌·자료·커뮤니티·선생님을 한 번에.
 *
 * 이동은 **서버가 준 `href`** 를 해석해서 한다(`nav/routes.ts`). 이전에는 유형별 탭을 이 파일이
 * 직접 들고 있었고, 그 표가 서버와 갈라져 강좌·커뮤니티가 엉뚱한 화면으로 갔다.
 */
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
                  {result.groups[g].map((h) => {
                    const r = resolveWebPath(h.href);
                    return (
                      <TouchableOpacity
                        key={h.id}
                        style={s.row}
                        onPress={() => {
                          if (r.kind === 'mobile') { goTab(r.tab); onClose(); return; }
                          // 비슷한 화면으로 대신 보내지 않는다 — 없으면 없다고 말한다.
                          showAlert(
                            r.kind === 'web-only' ? r.label : '이동할 수 없어요',
                            r.kind === 'web-only' ? `${r.why} 웹에서 확인해 주세요.` : '이 결과의 목적지를 앱에서 찾지 못했어요. 웹에서 확인해 주세요.',
                          );
                        }}
                      >
                        {h.subject ? <Text style={s.chip}>{h.subject}</Text> : null}
                        <Text style={s.rowTitle} numberOfLines={1}>{h.title}</Text>
                        {r.kind === 'mobile' ? null : <Text style={s.webChip}>웹</Text>}
                        {h.subtitle ? <Text style={s.rowSub} numberOfLines={1}>{h.subtitle}</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
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
  // 앱에 화면이 없는 결과 표식 — 눌러 보고 나서 알게 되는 것보다 목록에서 미리 보이는 편이 낫다.
  webChip: { fontSize: 10.5, fontWeight: '800', color: C.muted, borderWidth: 1, borderColor: C.line, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, overflow: 'hidden' },
  rowSub: { fontSize: 12, color: C.muted },
});
