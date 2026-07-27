import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';

type Feed = {
  questions: { id: string; subject: string; difficulty: string | null; question: string; answerExcerpt: string; answeredBy: string; answerCount: number; createdAt: string }[];
  materials: { id: string; title: string; subject: string; category: string | null; teacherName: string; viewCount: number; createdAt: string }[];
  reviews: { id: string; teacherName: string; rating: number; text: string; createdAt: string }[];
};
const fmtDate = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}`; };

export function CommunityScreen() {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState('');
  const load = () => api.get<Feed>('/community/feed').then(setFeed).catch((e) => setError(e instanceof ApiError ? e.message : '커뮤니티 조회 실패'));
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => { load(); }, []);

  // 실시간 — 표시된 질문 방을 구독해 다른 사용자의 답변·채택 시 피드 갱신.
  const qIds = (feed?.questions ?? []).map((q) => q.id).join(',');
  useEffect(() => {
    const ids = qIds ? qIds.split(',') : [];
    if (!ids.length) return;
    const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('mp_access') : '') ?? '';
    if (!token) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const s: Socket = io(origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
    const onUpdate = () => loadRef.current();
    s.on('connect', () => { for (const id of ids) s.emit('community:join', { postId: id }); });
    s.on('community:answer', onUpdate);
    s.on('community:accepted', onUpdate);
    return () => { for (const id of ids) s.emit('community:leave', { postId: id }); s.disconnect(); };
  }, [qIds]);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>커뮤니티 라운지</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>센터에서 인기 있는 질문·자료·후기를 모았어요.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {feed === null ? <Text style={ui.sub}>불러오는 중…</Text> : (
        <>
          {/* 인기 질문 */}
          <View style={[ui.card, { marginBottom: 12 }]}>
            <Text style={styles.secT}>💬 인기 질문 & 채택 답변</Text>
            {feed.questions.length === 0 ? <Text style={ui.sub}>아직 공개된 질문이 없어요.</Text> : feed.questions.map((q) => (
              <View key={q.id} style={styles.qItem}>
                <View style={styles.tagRow}>
                  <View style={[styles.tag, { backgroundColor: C.newBg }]}><Text style={[styles.tagT, { color: C.newC }]}>{q.subject}</Text></View>
                  {q.difficulty ? <View style={styles.tag}><Text style={styles.tagT}>{q.difficulty}</Text></View> : null}
                  <Text style={styles.meta}>답변 {q.answerCount} · {fmtDate(q.createdAt)}</Text>
                </View>
                <Text style={styles.qText}>Q. {q.question}</Text>
                <Text style={styles.aText}><Text style={{ color: C.teal, fontWeight: '700' }}>✓ {q.answeredBy} </Text>{q.answerExcerpt}</Text>
              </View>
            ))}
          </View>

          {/* 인기 자료 */}
          <View style={[ui.card, { marginBottom: 12 }]}>
            <Text style={styles.secT}>📚 이번 주 인기 자료</Text>
            {feed.materials.length === 0 ? <Text style={ui.sub}>공개된 자료가 없어요.</Text> : feed.materials.map((m, i) => (
              <View key={m.id} style={styles.mItem}>
                <Text style={styles.rank}>#{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mTitle}>{m.title}</Text>
                  <Text style={styles.meta}>{m.subject} · {m.teacherName} · 조회 {m.viewCount.toLocaleString()}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* 우수 후기 */}
          <View style={ui.card}>
            <Text style={styles.secT}>⭐ 우수 상담 후기</Text>
            {feed.reviews.length === 0 ? <Text style={ui.sub}>아직 등록된 후기가 없어요.</Text> : feed.reviews.map((r) => (
              <View key={r.id} style={styles.qItem}>
                <View style={styles.tagRow}>
                  <Text style={styles.rTeacher}>{r.teacherName} 선생님</Text>
                  <Text style={styles.star}>⭐ {r.rating.toFixed(1)}</Text>
                  <Text style={styles.meta}>{fmtDate(r.createdAt)}</Text>
                </View>
                <Text style={styles.aText}>“{r.text}”</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.meta, { textAlign: 'center', marginTop: 12 }]}>학생·보호자 정보는 비식별 처리됩니다.</Text>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  secT: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 10 },
  qItem: { borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 10, marginTop: 2, gap: 3 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 },
  tag: { backgroundColor: C.fill, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tagT: { fontSize: 11, fontWeight: '700', color: C.muted },
  meta: { fontSize: 12, color: C.caption },
  qText: { fontSize: 14, fontWeight: '700', color: C.ink },
  aText: { fontSize: 13, color: C.muted, lineHeight: 19 },
  mItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.lineSoft, paddingVertical: 10 },
  rank: { fontSize: 15, fontWeight: '800', color: C.teal, width: 30 },
  mTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  rTeacher: { fontSize: 13, fontWeight: '800', color: C.ink },
  star: { fontSize: 13, fontWeight: '700', color: '#E3B45C' },
});
