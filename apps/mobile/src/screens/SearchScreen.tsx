import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Teacher } from '../api';
import { C, R, SP, ui, gradeColor } from '../theme';

const SORTS: [string, string][] = [['grade', '기본'], ['rating', '만족도'], ['consult', '상담수'], ['question', '질문답변'], ['offline', '오프라인']];

export function SearchScreen({ onPick }: { onPick: (t: Teacher) => void }) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState('grade');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ name: string }[]>('/categories?kind=teacher').then((r) => setCats(r.map((c) => c.name))).catch(() => {});
  }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (category !== '전체') p.set('category', category);
    if (sort) p.set('sort', sort);
    p.set('size', '100');
    api.get<{ data?: Teacher[] } | Teacher[]>(`/teachers?${p}`)
      .then((r) => setTeachers(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [category, sort]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return teachers.filter((t) => !kw || t.name.toLowerCase().includes(kw) || t.subjects.join(',').toLowerCase().includes(kw));
  }, [teachers, q]);

  return (
    <View style={ui.screen}>
      <Text style={ui.h}>선생님 찾기</Text>
      <TextInput style={[ui.input, { marginTop: 8 }]} value={q} onChangeText={setQ} placeholder="이름·과목 검색" placeholderTextColor={C.caption} />
      {/* 카테고리 — 가로 줄바꿈, 낮은 높이 알약 */}
      <View style={styles.pillRow}>
        {['전체', ...cats].map((c) => (
          <TouchableOpacity key={c} style={[styles.pill, category === c && styles.pillOn]} onPress={() => setCategory(c)}><Text style={[styles.pillT, category === c && { color: C.white }]}>{c}</Text></TouchableOpacity>
        ))}
      </View>
      {/* 정렬 */}
      <View style={styles.pillRow}>
        {SORTS.map(([v, l]) => (
          <TouchableOpacity key={v} style={[styles.sortPill, sort === v && styles.sortOn]} onPress={() => setSort(v)}><Text style={[styles.sortT, sort === v && { color: C.teal }]}>{l}</Text></TouchableOpacity>
        ))}
      </View>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <FlatList
        style={{ marginTop: 8 }}
        data={rows}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={[ui.card, styles.card]} onPress={() => onPick(item)} activeOpacity={0.7}>
            <View style={styles.row}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name ?? '?').slice(0, 1)}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.name}</Text>
                  <View style={[styles.grade, { backgroundColor: gradeColor(item.grade) }]}><Text style={styles.gradeText}>{item.grade}</Text></View>
                  {item.offlineAvailable ? <View style={styles.offTag}><Text style={styles.offT}>오프라인</Text></View> : null}
                </View>
                <Text style={ui.sub}>{item.subjects.join(', ')}{item.category ? ` · ${item.category}` : ''}</Text>
                <Text style={styles.stat}>⭐ {item.rating ?? 0} · 상담 {item.totalConsult ?? 0}회 · 질문답변 {item.questionCount ?? 0}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={!error ? <Text style={ui.sub}>선생님이 없습니다.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: R.md, backgroundColor: C.teal100, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.teal, fontWeight: '800', fontSize: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, flexWrap: 'wrap' },
  name: { fontSize: 16, fontWeight: '700', color: C.ink },
  grade: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.md },
  gradeText: { color: C.white, fontWeight: '800', fontSize: 11 },
  offTag: { backgroundColor: C.doneBg, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 2 },
  offT: { color: C.done, fontSize: 10, fontWeight: '800' },
  stat: { fontSize: 12, color: C.muted, marginTop: 3 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingVertical: 4, paddingHorizontal: 12, backgroundColor: C.white },
  pillOn: { backgroundColor: C.teal, borderColor: C.teal },
  pillT: { color: C.muted, fontWeight: '700', fontSize: 12, lineHeight: 16 },
  sortPill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: C.lineSoft, borderRadius: R.pill, paddingVertical: 4, paddingHorizontal: 12, backgroundColor: C.white },
  sortOn: { borderColor: C.teal, backgroundColor: C.teal50 },
  sortT: { color: C.caption, fontWeight: '700', fontSize: 12, lineHeight: 16 },
});
