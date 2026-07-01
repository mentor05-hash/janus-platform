import { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Teacher } from '../api';
import { R, SP, gradeColor, useTheme, useUI, type Palette } from '../theme';

const SORTS: [string, string][] = [['grade', '기본'], ['rating', '만족도'], ['consult', '상담수'], ['question', '질문답변'], ['offline', '오프라인']];
const CTYPES: [string, string][] = [['담임', '🏫'], ['교과', '📐'], ['입시', '🎯'], ['심리', '💬']];
const SUBTYPES: Record<string, string[]> = {
  담임: ['생활전반', '학습전반'],
  교과: ['국어', '수학', '영어', '과학탐구', '사회탐구'],
  입시: ['성적별 대학라인', '유리한 전형선택', '입시정보', '유료컨설팅'],
  심리: ['LCA코칭', '심리상담'],
};
// 교과 세부값(표시) → 실제 선생님 과목(DB) 매핑
const SUBJECT_MAP: Record<string, string> = { 국어: '국어', 수학: '수학', 영어: '영어', 과학탐구: '과학', 사회탐구: '사회' };
const STRENGTH_POOL = ['개념정리', '문제풀이', '내신대비', '수능대비', '오답관리', '동기부여', '기초탄탄', '심화학습'];
type Rec = Teacher & { matchedNeeds?: string[] };

export function SearchScreen({ onPick, onGoQna }: { onPick: (t: Teacher) => void; onGoQna?: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [mode, setMode] = useState<'상담' | '질문'>('상담');
  const [consultType, setConsultType] = useState<string | null>(null);
  const [subType, setSubType] = useState<string | null>(null);
  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState('grade');
  const [q, setQ] = useState('');
  const [needs, setNeeds] = useState<string[]>([]);
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [recOpen, setRecOpen] = useState(false);
  const [board, setBoard] = useState<(Teacher & { rank: number })[]>([]);
  const [error, setError] = useState('');

  async function recommend() {
    try {
      const r = await api.post<Rec[]>('/teachers/recommend', { subject: subjectFilter ?? undefined, needs });
      setRecs(r);
    } catch (e) { setError(e instanceof ApiError ? e.message : '추천 실패'); }
  }

  // 교과 세부유형은 실제 subject 필터로 동작(과학탐구→과학·사회탐구→사회). 그 외 유형의 세부는 안내·프리필용.
  const subjectFilter = consultType === '교과' && subType ? SUBJECT_MAP[subType] ?? subType : null;

  useEffect(() => {
    api.get<{ name: string }[]>('/categories?kind=teacher').then((r) => setCats(r.map((c) => c.name))).catch(() => {});
    api.get<(Teacher & { rank: number })[]>('/teachers/leaderboard').then(setBoard).catch(() => {});
  }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (category !== '전체') p.set('category', category);
    if (subjectFilter) p.set('subject', subjectFilter);
    if (consultType) p.set('consultType', consultType);
    if (sort) p.set('sort', sort);
    p.set('size', '100');
    api.get<{ data?: Teacher[] } | Teacher[]>(`/teachers?${p}`)
      .then((r) => setTeachers(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [category, sort, subjectFilter, consultType]);

  function pickType(t: string) {
    setConsultType((cur) => (cur === t ? null : t));
    setSubType(null);
  }

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return teachers.filter((t) => !kw || t.name.toLowerCase().includes(kw) || t.subjects.join(',').toLowerCase().includes(kw));
  }, [teachers, q]);

  return (
    <View style={ui.screen}>
      {/* 제목 + 이름·과목 검색(오른쪽) */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>선생님 찾기</Text>
        {mode === '상담' && (
          <TextInput style={styles.searchInline} value={q} onChangeText={setQ} placeholder="이름·과목 검색" placeholderTextColor={C.caption} />
        )}
      </View>
      {/* 상담 / 질문 토글 */}
      <View style={styles.seg}>
        {(['상담', '질문'] as const).map((m) => (
          <TouchableOpacity key={m} style={[styles.segItem, mode === m && styles.segOn]} onPress={() => setMode(m)}><Text style={[styles.segT, mode === m && styles.segTOn]}>{m}</Text></TouchableOpacity>
        ))}
      </View>

      {mode === '질문' ? (
        <View style={[ui.card, { marginTop: 12 }]}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>질문은 Q&A 게시판에서</Text>
          <Text style={[ui.sub, { marginTop: 4 }]}>선생님에게 공개·지정 질문을 남기고 답변을 받을 수 있어요(건당 크레딧).</Text>
          {onGoQna ? <TouchableOpacity style={[ui.btn, { marginTop: 12 }]} onPress={onGoQna}><Text style={ui.btnText}>Q&A 게시판으로</Text></TouchableOpacity> : null}
        </View>
      ) : (
        <>
          {/* 상담 유형 — 라벨 왼쪽, 버튼 오른쪽 */}
          <View style={styles.inlineRow}>
            <Text style={styles.inlineLbl}>상담 유형</Text>
            <View style={styles.inlinePills}>
              {CTYPES.map(([t, ic]) => (
                <TouchableOpacity key={t} style={[styles.pill, consultType === t && styles.pillOn]} onPress={() => pickType(t)}><Text style={[styles.pillT, consultType === t && { color: C.white }]}>{ic} {t}</Text></TouchableOpacity>
              ))}
            </View>
          </View>
          {/* 세부 유형 (교과=과목 필터, 그 외=안내) */}
          {consultType && (
            <View style={styles.inlineRow}>
              <Text style={styles.inlineLbl}>{consultType === '교과' ? '과목' : '세부 유형'}</Text>
              <View style={styles.inlinePills}>
                {SUBTYPES[consultType].map((s) => (
                  <TouchableOpacity key={s} style={[styles.subPill, subType === s && styles.subOn]} onPress={() => setSubType((cur) => (cur === s ? null : s))}><Text style={[styles.subT, subType === s && { color: C.teal }]}>{s}</Text></TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {consultType === '심리' && <Text style={styles.note}>💬 심리상담(LCA코칭·심리상담)은 현재 기숙 온/오프라인으로 운영돼요.</Text>}
          {subType === '유료컨설팅' && <Text style={[styles.note, { color: '#92600A', backgroundColor: '#FEF6E7' }]}>💎 입시 유료컨설팅은 별도 단가가 적용돼요.</Text>}
          {/* 카테고리 — 라벨 왼쪽, 버튼 오른쪽 */}
          <View style={styles.inlineRow}>
            <Text style={styles.inlineLbl}>카테고리</Text>
            <View style={styles.inlinePills}>
              {['전체', ...cats].map((c) => (
                <TouchableOpacity key={c} style={[styles.pill, category === c && styles.pillOn]} onPress={() => setCategory(c)}><Text style={[styles.pillT, category === c && { color: C.white }]}>{c}</Text></TouchableOpacity>
              ))}
            </View>
          </View>
          {/* 선생님 배열 — 라벨 왼쪽, 정렬 버튼 오른쪽(가로 스크롤, 줄바꿈 없음) */}
          <View style={[styles.inlineRow, { alignItems: 'center' }]}>
            <Text style={[styles.inlineLbl, { paddingTop: 0 }]}>선생님배열</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingRight: 4 }}>
              {SORTS.map(([v, l]) => (
                <TouchableOpacity key={v} style={[styles.sortPill, sort === v && styles.sortOn]} onPress={() => setSort(v)}><Text style={[styles.sortT, sort === v && { color: C.teal }]}>{l}</Text></TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          {/* 이달의 우수 선생님 */}
          {board.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.boardTitle}>🏆 이달의 우수 선생님</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                {board.slice(0, 5).map((t) => (
                  <TouchableOpacity key={t.id} style={[styles.boardCard, t.rank <= 3 && { backgroundColor: C.teal50, borderColor: C.teal100 }]} onPress={() => onPick(t)}>
                    <Text style={styles.boardRank}>{t.rank === 1 ? '🥇' : t.rank === 2 ? '🥈' : t.rank === 3 ? '🥉' : `#${t.rank}`}</Text>
                    <Text style={styles.boardName}>{t.name}</Text>
                    <Text style={styles.boardMeta}>{t.subjects.join(',')} · ⭐{t.rating ?? 0}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          {/* 맞춤 추천 */}
          <TouchableOpacity style={styles.recToggle} onPress={() => setRecOpen((o) => !o)}>
            <Text style={styles.recToggleT}>✨ 맞춤 추천 {recOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {recOpen && (
            <View style={styles.recBox}>
              <Text style={styles.recSub}>필요한 점을 고르면 선생님 강점·평가로 매칭해 드려요.</Text>
              <View style={styles.pillRow}>
                {STRENGTH_POOL.map((s) => (
                  <TouchableOpacity key={s} style={[styles.recPill, needs.includes(s) && styles.recPillOn]} onPress={() => setNeeds((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])}>
                    <Text style={[styles.recPillT, needs.includes(s) && { color: C.white }]}>#{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[ui.btn, { marginTop: 8 }]} onPress={recommend}><Text style={ui.btnText}>맞춤 추천 받기</Text></TouchableOpacity>
              {recs && (recs.length === 0 ? <Text style={ui.sub}>조건에 맞는 선생님이 없어요.</Text> : recs.slice(0, 5).map((t) => (
                <TouchableOpacity key={t.id} style={styles.recCard} onPress={() => onPick(t)}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.name}>{t.name}</Text>
                      <View style={[styles.grade, { backgroundColor: gradeColor(t.grade, C) }]}><Text style={styles.gradeText}>{t.grade}</Text></View>
                    </View>
                    <Text style={ui.sub}>{t.subjects.join(', ')} · ⭐ {t.rating ?? 0}</Text>
                    {(t.matchedNeeds?.length ?? 0) > 0 && <Text style={styles.matched}>{t.matchedNeeds!.map((n) => `#${n}`).join(' ')}</Text>}
                  </View>
                  <Text style={{ color: C.caption, fontSize: 18 }}>›</Text>
                </TouchableOpacity>
              )))}
            </View>
          )}
        </>
      )}
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {mode === '상담' && <FlatList
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
                  <View style={[styles.grade, { backgroundColor: gradeColor(item.grade, C) }]}><Text style={styles.gradeText}>{item.grade}</Text></View>
                  {item.offlineAvailable ? <View style={styles.offTag}><Text style={styles.offT}>오프라인</Text></View> : null}
                </View>
                <Text style={ui.sub}>{item.subjects.join(', ')}{item.category ? ` · ${item.category}` : ''}</Text>
                <Text style={styles.stat}>⭐ {item.rating ?? 0} · 상담 {item.totalConsult ?? 0}회 · 질문답변 {item.questionCount ?? 0}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={!error ? <Text style={ui.sub}>선생님이 없습니다.</Text> : null}
      />}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SP.md },
  title: { fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  searchInline: { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: C.ink },
  inlineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  inlineLbl: { width: 58, fontSize: 11, fontWeight: '800', color: C.caption, lineHeight: 14, paddingTop: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  inlinePills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
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
  seg: { flexDirection: 'row', backgroundColor: C.lineSoft, borderRadius: 10, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segOn: { backgroundColor: C.white },
  segT: { fontSize: 13, fontWeight: '700', color: C.muted },
  segTOn: { color: C.teal, fontWeight: '800' },
  lbl: { fontSize: 11, fontWeight: '800', color: C.caption, marginTop: 12, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  subPill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: C.lineSoft, borderRadius: R.pill, paddingVertical: 4, paddingHorizontal: 12, backgroundColor: C.teal50 },
  subOn: { borderColor: C.teal, backgroundColor: C.teal100 },
  subT: { color: C.muted, fontWeight: '700', fontSize: 12, lineHeight: 16 },
  note: { fontSize: 12, color: C.teal, backgroundColor: C.teal50, borderRadius: 8, padding: 9, marginTop: 8 },
  recToggle: { marginTop: 10, backgroundColor: C.teal50, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  recToggleT: { color: C.teal, fontWeight: '800', fontSize: 13 },
  recBox: { marginTop: 8, backgroundColor: C.white, borderWidth: 1, borderColor: C.teal100, borderRadius: 12, padding: 12 },
  recSub: { fontSize: 12, color: C.muted, marginBottom: 8 },
  recPill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingVertical: 4, paddingHorizontal: 11, backgroundColor: C.white },
  recPillOn: { backgroundColor: C.teal, borderColor: C.teal },
  recPillT: { color: C.muted, fontWeight: '700', fontSize: 12 },
  recCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.teal50, borderRadius: 10, padding: 11, marginTop: 8 },
  matched: { fontSize: 12, color: C.teal, fontWeight: '700', marginTop: 3 },
  boardTitle: { fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 8 },
  boardCard: { width: 120, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, alignItems: 'center' },
  boardRank: { fontSize: 18 },
  boardName: { fontSize: 14, fontWeight: '800', color: C.ink, marginTop: 2 },
  boardMeta: { fontSize: 11, color: C.muted, marginTop: 2 },
});
