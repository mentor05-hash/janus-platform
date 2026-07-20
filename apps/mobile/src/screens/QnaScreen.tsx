import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { io } from 'socket.io-client';
import { api, ApiError } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';

type Attachment = { id: string; name: string; type?: string };
type Answer = { id: string; body: string; accepted: boolean; teacherName: string; escalationOk?: boolean };
type Post = { id: string; subject: string | null; difficulty: string | null; scope: string; body: string; status: string; created_at: string; aiDraft?: string | null; claimedAt?: string | null; firstReplyAt?: string | null; assignedTeacherId?: string | null; attachments?: Attachment[]; answers?: Answer[] };
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
const statusLabel = (p: Post) =>
  p.status === 'resolved' ? '채택완료'
  : (p.answers?.length ?? 0) > 0 ? '답변옴'
  : p.status === 'ai_pending' ? (p.aiDraft ? '✦ AI 풀이 도착' : '✦ AI 풀이 생성 중')
  : (p.claimedAt || p.assignedTeacherId) ? '👀 선생님 확인 중'
  : '답변대기';
const isDone = (p: Post) => p.status === 'resolved' || (p.answers?.length ?? 0) > 0;
/** 시각 표시 — 오늘이면 "14:32", 아니면 "7/20 14:32" (KST). */
const T = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const hm = d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toDateString() === now.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};
const ask = (m: string) => (typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(m) : true);

export function QnaScreen() {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('수학');
  const [scope, setScope] = useState('open');
  const [difficulty, setDifficulty] = useState('중'); // 난이도 → 답변블록 시간 차등
  const [body, setBody] = useState('');
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  // 난이도별 답변블록 시간(정책) + 질문 요금(정책). 본사 관리자가 조정.
  const [durPol, setDurPol] = useState<Record<string, number> | null>(null);
  type FeeInfo = { itemFee: number; generalFee: number; freeQuota?: { remaining: number } | null; ticketRemaining?: number | null };
  const [fee, setFee] = useState<FeeInfo | null>(null);
  const loadFee = () => api.get<FeeInfo>('/qna/pricing').then(setFee).catch(() => { /* 요금 조회 실패 */ });
  useEffect(() => {
    api.get<Record<string, number>>('/bookings/question-duration/policy').then(setDurPol).catch(() => { /* 정책 없으면 기본 */ });
    void loadFee();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 난이도(하/중/상) → 티어(기초/중급/심화) → 분
  const tierOf = (d: string) => (d === '하' ? '기초' : d === '상' ? '심화' : '중급');
  const blockMin = durPol?.[tierOf(difficulty)] ?? { 하: 10, 중: 20, 상: 30 }[difficulty] ?? 20;

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
  // 실시간 갱신(웹 파리티) — 답변·클레임 알림(notif:new) 수신 시 목록 리로드 + 30초 폴백 폴링 + 탭 복귀 리로드.
  useEffect(() => {
    const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('mp_access') : '') ?? '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const s = io(origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
    s.on('notif:new', (n: { type?: string }) => {
      if (['qna_answered', 'qna_claimed', 'qna_assigned', 'qna_followup', 'qna_community_answer'].includes(n?.type ?? '')) load();
    });
    const iv = setInterval(load, 30_000);
    const onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') load(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => { s.close(); clearInterval(iv); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function accept(answerId: string) {
    setError(''); setMsg('');
    try { await api.patch(`/qna/answers/${answerId}/accept`, {}); setMsg('답변을 채택했습니다.'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '채택 실패'); }
  }

  // 상담 이어가기(웹 파리티) — 후보 시간대 제시 → 선택 시 재검증 후 예약.
  const [escCand, setEscCand] = useState<{ postId: string; minutes?: number; items: { dateStr: string; slotStart: number; label: string }[] } | null>(null);
  async function escalate(postId: string, pick?: { dateStr: string; slotStart: number }) {
    setError(''); setMsg('');
    try {
      const r = await api.post<{ bookingId?: string; message?: string; candidates?: { dateStr: string; slotStart: number; label: string }[]; minutes?: number }>(`/qna/posts/${postId}/escalate`, pick ?? {});
      if (r.bookingId) { setEscCand(null); setMsg('상담 예약이 생성됐어요. 내 예약에서 확인하세요.'); load(); return; }
      if (r.candidates?.length) { setEscCand({ postId, minutes: r.minutes, items: r.candidates }); return; }
      setEscCand(null); setMsg(r.message ?? '상담 예약을 생성하지 못했어요.'); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '상담 승격 실패'); }
  }

  async function submit() {
    setError(''); setMsg('');
    if (!body.trim()) { setError('질문 내용을 입력하세요.'); return; }
    // 실수 등록 방지(웹 파리티) — 등록은 무료(P2), 과금은 [선생님 답변 받기] 시점.
    if (!ask(`이 상태로 질문을 등록할까요?\n\n· 과목: ${subject} (${scope === 'assigned' ? '지정' : '공개'} · 난이도 ${difficulty})\n· 사진 첨부: ${atts.length}장\n\n등록은 무료예요 — 질문권·크레딧은 [선생님 답변 받기]를 누를 때만 사용됩니다.`)) return;
    try {
      await api.post('/qna/posts', { subject, qType: 'general', scope, difficulty, body, attachments: atts });
      setMsg('질문이 등록됐어요 — AI 풀이가 곧 도착합니다. 부족하면 [선생님 답변 받기]를 눌러주세요.');
      setBody(''); setAtts([]); setOpen(false); load();
    } catch (e) { setError(e instanceof ApiError ? (e.status === 402 ? '크레딧이 부족합니다.' : e.message) : '등록 실패'); }
  }

  // P2 — AI 1층 퍼널 액션(웹 파리티): 질문권·크레딧 소진 지점은 반드시 확인.
  async function resolveAi(postId: string) {
    setError(''); setMsg('');
    try {
      await api.post(`/qna/posts/${postId}/resolve-ai`, {});
      setMsg('AI 풀이로 해결했어요 — 무료 질문권·크레딧이 사용되지 않았습니다.'); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '처리 실패'); }
  }
  async function requestTeacher(postId: string) {
    setError(''); setMsg('');
    const freeLeft = fee?.freeQuota?.remaining ?? 0;
    const ticketLeft = fee?.ticketRemaining ?? 0;
    const cost = freeLeft > 0
      ? `무료 질문권 1건이 사용됩니다(이번 주 ${freeLeft}건 남음).`
      : ticketLeft > 0
        ? `보유 질문권 1건이 사용됩니다(${ticketLeft}건 보유).`
        : `크레딧 ${(fee?.generalFee ?? 0).toLocaleString()}이 차감됩니다.`;
    if (!ask(`선생님 답변을 요청할까요?\n\n${cost}`)) return;
    try {
      const r = await api.post<{ freeUsed?: boolean; freeRemaining?: number; usedTicket?: boolean; ticketRemaining?: number; chargedCredits?: number }>(`/qna/posts/${postId}/request-teacher`, {});
      setMsg(r.freeUsed
        ? `선생님 답변을 요청했어요 — 무료 질문권 사용(이번 주 ${r.freeRemaining ?? 0}건 남음).`
        : r.usedTicket
          ? `선생님 답변을 요청했어요 — 보유 질문권 사용(${r.ticketRemaining ?? 0}건 남음).`
          : `선생님 답변을 요청했어요(${(r.chargedCredits ?? 0).toLocaleString()} 크레딧 차감).`);
      load(); void loadFee();
    } catch (e) { setError(e instanceof ApiError ? (e.status === 402 ? '크레딧이 부족합니다 — 결제요청이 생성되었어요.' : e.message) : '요청 실패'); }
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
          <Text style={styles.lbl}>난이도</Text>
          <View style={styles.pills}>
            {['하', '중', '상'].map((d) => (
              <TouchableOpacity key={d} style={[styles.pill, difficulty === d && styles.pillOn]} onPress={() => setDifficulty(d)}><Text style={[styles.pillT, difficulty === d && { color: C.white }]}>{d}</Text></TouchableOpacity>
            ))}
          </View>
          <View style={styles.qInfo}>
            <Text style={styles.qInfoT}>
              답변블록 약 {blockMin}분
              {fee?.freeQuota && fee.freeQuota.remaining > 0 ? ` · 이번 주 무료 질문 ${fee.freeQuota.remaining}건 남음` : fee ? ` · 건당 ${fee.generalFee.toLocaleString()} 크레딧` : ''}
              {(fee?.ticketRemaining ?? 0) > 0 ? ` · 보유 질문권 ${fee!.ticketRemaining}건` : ''}
            </Text>
            <Text style={styles.qInfoSub}>등록은 무료 — 질문권·크레딧은 [선생님 답변 받기]를 누를 때만 사용돼요. 난이도가 높을수록 답변블록이 길어집니다.</Text>
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
          <Text style={styles.time}>등록 {T(p.created_at)}{p.firstReplyAt ? ` · 첫 답변 ${T(p.firstReplyAt)}` : p.claimedAt ? ` · 확인 시작 ${T(p.claimedAt)}` : ''}</Text>
          <Text style={styles.body}>{p.body}</Text>
          {/* P2 — AI 1층: 풀이 표시 + [AI로 해결]/[선생님 답변 받기] 퍼널 */}
          {(p.aiDraft || p.status === 'ai_pending') && (
            <View style={styles.aiBox}>
              <Text style={styles.aiHead}>✦ AI 풀이 · 참고용 무료 즉답</Text>
              {p.aiDraft
                ? <Text style={styles.aiBody}>{p.aiDraft}</Text>
                : <Text style={styles.aiBody}>AI 풀이를 생성하고 있어요 — 잠시 후 새로고침해 주세요.</Text>}
              {p.status === 'ai_pending' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <TouchableOpacity style={styles.aiOkBtn} onPress={() => void resolveAi(p.id)}>
                    <Text style={styles.aiOkT}>👍 AI 풀이로 해결(무료 종료)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.humanBtn} onPress={() => void requestTeacher(p.id)}>
                    <Text style={styles.humanT}>
                      👩‍🏫 선생님 답변 받기
                      {fee?.freeQuota && fee.freeQuota.remaining > 0 ? ` (무료 ${fee.freeQuota.remaining}건)` : (fee?.ticketRemaining ?? 0) > 0 ? ` (질문권 ${fee!.ticketRemaining}건)` : fee ? ` (${fee.generalFee.toLocaleString()} 크레딧)` : ''}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
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
          {/* 상담 이어가기 — 답변이 있으면(채택 전·후 모두) 같은 선생님과 상담 승격(웹 파리티) */}
          {(p.answers?.length ?? 0) > 0 && (p.status === 'open' || p.status === 'resolved')
            && ((p.answers!.find((a) => a.accepted) ?? p.answers![p.answers!.length - 1])?.escalationOk !== false) && (
            <TouchableOpacity style={styles.escBtn} onPress={() => void escalate(p.id)}>
              <Text style={styles.escT}>💬 상담으로 이어가기</Text>
            </TouchableOpacity>
          )}
          {escCand?.postId === p.id && (
            <View style={styles.escBox}>
              <Text style={styles.escHead}>📅 가까운 상담 가능 시간{escCand.minutes ? ` (${escCand.minutes}분)` : ''} — 골라주시면 바로 예약돼요</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {escCand.items.map((c) => (
                  <TouchableOpacity key={`${c.dateStr}-${c.slotStart}`} style={styles.escSlot} onPress={() => void escalate(p.id, { dateStr: c.dateStr, slotStart: c.slotStart })}>
                    <Text style={styles.escSlotT}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setEscCand(null)} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
                  <Text style={{ fontSize: 12, color: C.muted }}>취소</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  qInfo: { backgroundColor: C.teal50, borderRadius: 8, padding: 10, marginTop: 8 },
  qInfoT: { fontSize: 13, fontWeight: '800', color: C.teal },
  qInfoSub: { fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 16 },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  pillOn: { backgroundColor: C.teal, borderColor: C.teal },
  pillT: { color: C.muted, fontWeight: '700', fontSize: 13 },
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  tag: { backgroundColor: C.fill, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tagT: { fontSize: 11, fontWeight: '700', color: C.muted },
  body: { fontSize: 14, color: C.ink, lineHeight: 20 },
  time: { fontSize: 11, color: C.caption, marginBottom: 6 },
  aiBox: { backgroundColor: C.teal50, borderWidth: 1, borderColor: C.teal100, borderRadius: R.md, padding: 10, marginTop: 8 },
  aiHead: { fontSize: 12, fontWeight: '800', color: C.teal },
  aiBody: { fontSize: 13.5, color: C.ink, marginTop: 6, lineHeight: 20 },
  aiOkBtn: { borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  aiOkT: { color: C.muted, fontWeight: '700', fontSize: 12.5 },
  humanBtn: { backgroundColor: C.teal, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  humanT: { color: C.white, fontWeight: '800', fontSize: 12.5 },
  answer: { backgroundColor: C.fill, borderRadius: R.md, padding: 10, marginTop: 8 },
  ansT: { fontSize: 13, fontWeight: '800', color: C.ink },
  ansBody: { fontSize: 14, color: C.ink, marginTop: 4, lineHeight: 20 },
  acceptBtn: { backgroundColor: C.teal, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12 },
  acceptT: { color: C.white, fontWeight: '800', fontSize: 12 },
  escBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: C.teal, backgroundColor: C.teal50, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, marginTop: 8 },
  escT: { color: C.teal, fontWeight: '800', fontSize: 12.5 },
  escBox: { borderWidth: 1, borderColor: C.teal, backgroundColor: C.teal50, borderRadius: 10, padding: 10, marginTop: 8 },
  escHead: { fontSize: 12.5, fontWeight: '800', color: C.teal },
  escSlot: { borderWidth: 1, borderColor: C.teal, backgroundColor: C.white, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  escSlotT: { fontSize: 12.5, fontWeight: '700', color: C.teal },
  note: { fontSize: 12, color: C.confirmed, backgroundColor: C.confirmedBg, borderRadius: 8, padding: 8, marginBottom: 8, lineHeight: 17 },
  imgRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 4 },
  imgAdd: { width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: C.inputBorder, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
  imgAddT: { color: C.muted, fontSize: 12, fontWeight: '700' },
  imgDel: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center' },
  imgDelT: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
