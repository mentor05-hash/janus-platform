import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';

type Attachment = { id: string; name: string; type?: string };
type Answer = { id: string; body: string; accepted: boolean; teacherName: string };
type Post = { id: string; subject: string | null; difficulty: string | null; scope: string; body: string; status: string; created_at: string; attachments?: Attachment[]; answers?: Answer[] };
const SUBJECTS = ['국어', '수학', '영어', '탐구'];
const MAX_IMG = 3;
const isImage = (a: Attachment) => (a.type ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.name);

/** 인증 이미지 썸네일 — 탭하면 확대(모달). */
function QnaImage({ fileId, size = 80 }: { fileId: string; size?: number }) {
  const { C } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => { let live = true; api.fileBlobUrl(fileId).then((u) => { if (live) setUri(u); }).catch(() => {}); return () => { live = false; }; }, [fileId]);
  if (!uri) return <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: C.fill }} />;
  return (
    <>
      <TouchableOpacity onPress={() => setZoom(true)} activeOpacity={0.85}>
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 8, borderWidth: 1, borderColor: C.line }} />
      </TouchableOpacity>
      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setZoom(false)} style={{ flex: 1, backgroundColor: 'rgba(8,16,20,0.9)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <Image source={{ uri }} style={{ width: '96%', height: '86%', resizeMode: 'contain' }} />
          <Text style={{ position: 'absolute', top: 24, right: 24, color: '#fff', fontSize: 24, fontWeight: '800' }}>✕</Text>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
const statusLabel = (p: Post) => (p.status === 'resolved' ? '채택완료' : (p.answers?.length ?? 0) > 0 ? '답변옴' : '답변대기');
const isDone = (p: Post) => p.status === 'resolved' || (p.answers?.length ?? 0) > 0;

export function QnaScreen() {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('수학');
  const [scope, setScope] = useState('open');
  const [body, setBody] = useState('');
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // expo-web 파일 선택 → /files 업로드(최대 3장)
  function pickImages() {
    if (typeof document === 'undefined') { setError('이미지 첨부는 앱에서 지원됩니다.'); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.onchange = async () => {
      setError('');
      const files = Array.from(input.files ?? []).filter((x) => x.type.startsWith('image/'));
      const room = MAX_IMG - atts.length;
      if (room <= 0) { setError(`이미지는 최대 ${MAX_IMG}장까지 첨부할 수 있어요.`); return; }
      for (const file of files.slice(0, room)) {
        try { const r = await api.uploadWeb(file, file.name); setAtts((p) => [...p, { id: r.id, name: r.filename, type: r.contentType }]); }
        catch { setError('이미지 업로드 실패'); }
      }
      if (files.length > room) setError(`한 문항 기준 이미지는 ${MAX_IMG}장까지만 등록됩니다.`);
    };
    input.click();
  }

  function load() { api.get<Post[]>('/qna/posts').then(setPosts).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패')); }
  useEffect(load, []);

  async function accept(answerId: string) {
    setError(''); setMsg('');
    try { await api.patch(`/qna/answers/${answerId}/accept`, {}); setMsg('답변을 채택했습니다.'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '채택 실패'); }
  }

  async function submit() {
    setError(''); setMsg('');
    if (!body.trim()) { setError('질문 내용을 입력하세요.'); return; }
    try {
      await api.post('/qna/posts', { subject, qType: 'general', scope, difficulty: '중', body, attachments: atts });
      setMsg('질문이 등록되었습니다(건당 크레딧 차감).'); setBody(''); setAtts([]); setOpen(false); load();
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

          {/* 문제 이미지 (최대 3장, 한 문항만) */}
          <Text style={styles.lbl}>문제 이미지 (최대 {MAX_IMG}장)</Text>
          <Text style={styles.note}>⚠️ 한 번에 한 문항만 올려주세요. 여러 문항을 함께 올리면 답변이 정확하지 않을 수 있어요.</Text>
          <View style={styles.imgRow}>
            {atts.map((a) => (
              <View key={a.id} style={{ position: 'relative' }}>
                <QnaImage fileId={a.id} size={72} />
                <TouchableOpacity onPress={() => setAtts((p) => p.filter((x) => x.id !== a.id))} style={styles.imgDel}><Text style={styles.imgDelT}>✕</Text></TouchableOpacity>
              </View>
            ))}
            {atts.length < MAX_IMG && (
              <TouchableOpacity style={styles.imgAdd} onPress={pickImages}><Text style={styles.imgAddT}>＋ 사진</Text></TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={[ui.btn, { marginTop: 10 }]} onPress={submit}><Text style={ui.btnText}>질문 등록</Text></TouchableOpacity>
        </View>
      )}

      <Text style={styles.sec}>내 질문</Text>
      {posts === null ? <Text style={ui.sub}>불러오는 중…</Text> : posts.length === 0 ? <Text style={ui.sub}>등록한 질문이 없어요.</Text> : posts.map((p) => (
        <View key={p.id} style={[ui.card, { marginBottom: 8 }]}>
          <View style={styles.tagRow}>
            <View style={styles.tag}><Text style={styles.tagT}>{p.subject ?? '질문'}</Text></View>
            <View style={styles.tag}><Text style={styles.tagT}>{p.scope === 'open' ? '공개' : '지정'}</Text></View>
            <View style={[styles.tag, { backgroundColor: isDone(p) ? C.doneBg : C.confirmedBg }]}>
              <Text style={[styles.tagT, { color: isDone(p) ? C.done : C.confirmed }]}>{statusLabel(p)}</Text>
            </View>
          </View>
          <Text style={styles.body}>{p.body}</Text>
          {(p.attachments ?? []).filter(isImage).length > 0 && (
            <View style={styles.imgRow}>
              {p.attachments!.filter(isImage).map((a) => <QnaImage key={a.id} fileId={a.id} size={84} />)}
            </View>
          )}
          {(p.answers ?? []).map((a) => (
            <View key={a.id} style={styles.answer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.ansT}>{a.teacherName} 선생님 답변{a.accepted ? ' · 채택됨' : ''}</Text>
                {!a.accepted && p.status !== 'resolved' && (
                  <TouchableOpacity style={styles.acceptBtn} onPress={() => accept(a.id)}><Text style={styles.acceptT}>채택</Text></TouchableOpacity>
                )}
              </View>
              <Text style={styles.ansBody}>{a.body}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
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
  answer: { backgroundColor: C.fill, borderRadius: R.md, padding: 10, marginTop: 8 },
  ansT: { fontSize: 13, fontWeight: '800', color: C.ink },
  ansBody: { fontSize: 14, color: C.ink, marginTop: 4, lineHeight: 20 },
  acceptBtn: { backgroundColor: C.teal, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12 },
  acceptT: { color: C.white, fontWeight: '800', fontSize: 12 },
  note: { fontSize: 12, color: C.confirmed, backgroundColor: C.confirmedBg, borderRadius: 8, padding: 8, marginBottom: 8, lineHeight: 17 },
  imgRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 4 },
  imgAdd: { width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: C.inputBorder, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
  imgAddT: { color: C.muted, fontSize: 12, fontWeight: '700' },
  imgDel: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center' },
  imgDelT: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
