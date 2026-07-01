import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { C, R, SP, ui } from '../theme';

type Post = { id: string; subject: string | null; difficulty: string | null; scope: string; body: string; status: string; created_at: string };
const SUBJECTS = ['국어', '수학', '영어', '탐구'];
const statusLabel = (s: string) => (s === 'accepted' ? '채택완료' : s === 'answered' ? '답변옴' : '답변대기');

export function QnaScreen() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('수학');
  const [scope, setScope] = useState('open');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function load() { api.get<Post[]>('/qna/posts').then(setPosts).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패')); }
  useEffect(load, []);

  async function submit() {
    setError(''); setMsg('');
    if (!body.trim()) { setError('질문 내용을 입력하세요.'); return; }
    try {
      await api.post('/qna/posts', { subject, qType: 'general', scope, difficulty: '중', body });
      setMsg('질문이 등록되었습니다(건당 크레딧 차감).'); setBody(''); setOpen(false); load();
    } catch (e) { setError(e instanceof ApiError ? (e.status === 402 ? '크레딧이 부족합니다.' : e.message) : '등록 실패'); }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>질문 게시판</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>선생님에게 질문을 남기고 답변을 받습니다(건당 크레딧).</Text>

      <TouchableOpacity style={styles.newBtn} onPress={() => setOpen((o) => !o)}><Text style={styles.newT}>{open ? '닫기' : '＋ 질문 작성'}</Text></TouchableOpacity>
      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {open && (
        <View style={[ui.card, { marginTop: SP.md }]}>
          <Text style={styles.lbl}>과목</Text>
          <View style={styles.pills}>
            {SUBJECTS.map((s) => (
              <TouchableOpacity key={s} style={[styles.pill, subject === s && styles.pillOn]} onPress={() => setSubject(s)}><Text style={[styles.pillT, subject === s && { color: C.white }]}>{s}</Text></TouchableOpacity>
            ))}
          </View>
          <Text style={styles.lbl}>공개범위</Text>
          <View style={styles.pills}>
            {[['open', '공개'], ['assigned', '지정']].map(([v, l]) => (
              <TouchableOpacity key={v} style={[styles.pill, scope === v && styles.pillOn]} onPress={() => setScope(v)}><Text style={[styles.pillT, scope === v && { color: C.white }]}>{l}</Text></TouchableOpacity>
            ))}
          </View>
          <TextInput style={[ui.input, { height: 90, textAlignVertical: 'top', marginTop: 8 }]} multiline value={body} onChangeText={setBody} placeholder="예: 합성함수 미분에서 왜 이렇게 전개되나요?" placeholderTextColor={C.caption} />
          <TouchableOpacity style={[ui.btn, { marginTop: 10 }]} onPress={submit}><Text style={ui.btnText}>질문 등록</Text></TouchableOpacity>
        </View>
      )}

      <Text style={styles.sec}>내 질문</Text>
      {posts === null ? <Text style={ui.sub}>불러오는 중…</Text> : posts.length === 0 ? <Text style={ui.sub}>등록한 질문이 없어요.</Text> : posts.map((p) => (
        <View key={p.id} style={[ui.card, { marginBottom: 8 }]}>
          <View style={styles.tagRow}>
            <View style={styles.tag}><Text style={styles.tagT}>{p.subject ?? '질문'}</Text></View>
            <View style={styles.tag}><Text style={styles.tagT}>{p.scope === 'open' ? '공개' : '지정'}</Text></View>
            <View style={[styles.tag, { backgroundColor: p.status === 'answered' || p.status === 'accepted' ? C.doneBg : C.confirmedBg }]}>
              <Text style={[styles.tagT, { color: p.status === 'answered' || p.status === 'accepted' ? C.done : C.confirmed }]}>{statusLabel(p.status)}</Text>
            </View>
          </View>
          <Text style={styles.body}>{p.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  newBtn: { alignSelf: 'flex-start', backgroundColor: C.teal, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 18 },
  newT: { color: C.white, fontWeight: '800', fontSize: 14 },
  ok: { color: C.done, fontSize: 13, marginTop: 8, fontWeight: '600' },
  lbl: { fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 8, marginBottom: 6 },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  pillOn: { backgroundColor: C.teal, borderColor: C.teal },
  pillT: { color: C.muted, fontWeight: '700', fontSize: 13 },
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  tag: { backgroundColor: C.fill, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tagT: { fontSize: 11, fontWeight: '700', color: C.muted },
  body: { fontSize: 14, color: C.ink, lineHeight: 20 },
});
