import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { api, ApiError, Booking } from '../api';
import { useTheme, type Palette } from '../theme';
import { useSessionHost, SessionHost } from './SessionHost';
import { ChatInboxScreen } from './ChatInboxScreen';
import { TeacherReportPanel } from './TeacherReportPanel';
import { queueNote, flushNotes, queuedCount, onlineFlush } from '../offlineQueue';

// ── 공통 ──
const KST = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const unwrap = <T,>(r: { data?: T } | T): T => (Array.isArray(r) ? (r as T) : ((r as { data?: T }).data ?? (r as T)));

type Inbox = {
  counts: { requests: number; questions: number; unreadChats: number; notifications: number };
  requests: { bookingId: string; studentName: string; consultType: string | null; subType: string | null; mode: string; start: string | null }[];
  questions: { id: string; studentName: string; body: string | null; assigned: boolean; createdAt: string }[];
  notifications: { id: string; title?: string; body?: string; readAt?: string | null; createdAt: string }[];
};
type Filter = 'all' | 'req' | 'q' | 'noti';

/** ① 인박스 — /me/inbox 집계(대기 상담신청·질문·미확인·알림) + 유형 필터 + 인라인 수락/거절/답변. */
export function TeacherInbox() {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const wide = useWindowDimensions().width >= 900;
  const [d, setD] = useState<Inbox | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [ansFor, setAnsFor] = useState<string | null>(null);
  const [ansText, setAnsText] = useState('');
  const [chatsOpen, setChatsOpen] = useState(false); // 채팅 인박스 오버레이 — '새 메시지' 탭

  const load = useCallback(() => { api.get<Inbox>('/me/inbox').then((r) => setD(unwrap(r))).catch(() => setD(null)); }, []);
  useEffect(() => { load(); }, [load]);

  async function respond(bookingId: string, action: 'accept' | 'reject') {
    setBusy(bookingId); setMsg('');
    try { await api.patch(`/bookings/${bookingId}/${action}`, {}); setMsg(action === 'accept' ? '상담을 수락했어요.' : '상담을 거절했어요(크레딧 환원).'); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : '처리 실패'); } finally { setBusy(null); }
  }
  async function answer(q: Inbox['questions'][number]) {
    if (!ansText.trim()) return;
    setBusy(q.id); setMsg('');
    try {
      if (!q.assigned) await api.post(`/qna/posts/${q.id}/claim`, {}).catch(() => {}); // 미지정이면 담당 먼저
      await api.post(`/qna/posts/${q.id}/answers`, { body: ansText.trim() });
      setMsg('답변을 등록했어요.'); setAnsFor(null); setAnsText(''); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '답변 실패'); } finally { setBusy(null); }
  }

  if (chatsOpen) return <ChatInboxScreen onBack={() => { setChatsOpen(false); load(); }} />;
  if (!d) return <Center C={C} />;
  const show = (f: Filter) => filter === 'all' || filter === f;
  const chips: { k: Filter; label: string; n?: number }[] = [
    { k: 'all', label: '전체' },
    { k: 'req', label: '상담신청', n: d.counts.requests },
    { k: 'q', label: '질문', n: d.counts.questions },
    { k: 'noti', label: '알림', n: d.counts.notifications },
  ];
  const empty = (show('req') ? d.requests.length : 0) + (show('q') ? d.questions.length : 0) + (show('noti') ? d.notifications.length : 0) === 0;

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={s.h1}>인박스</Text>
      <View style={s.summary}>
        <Sum label="대기 상담" n={d.counts.requests} C={C} />
        <Sum label="답변 대기" n={d.counts.questions} C={C} />
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.7} onPress={() => setChatsOpen(true)}>
          <Sum label="새 메시지 ›" n={d.counts.unreadChats} C={C} accent />
        </TouchableOpacity>
      </View>
      <View style={s.chips}>
        {chips.map((c) => (
          <TouchableOpacity key={c.k} style={[s.chip, filter === c.k && s.chipOn]} onPress={() => setFilter(c.k)}>
            <Text style={[s.chipT, filter === c.k && { color: '#fff' }]}>{c.label}{c.n ? ` ${c.n}` : ''}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {msg ? <Text style={s.msg}>{msg}</Text> : null}
      {empty && <Text style={s.empty}>표시할 항목이 없어요.</Text>}

      <View style={wide ? s.grid : { gap: 10 }}>
      {show('req') && d.requests.map((r) => (
        <View key={r.bookingId} style={[s.card, s.cardNew, wide && s.half]}>
          <View style={s.row}><Text style={s.title}>{r.studentName} · 상담신청</Text><Text style={s.time}>{KST(r.start)}</Text></View>
          <Text style={s.body}>{r.consultType ?? '상담'} · {modeLabel(r.mode)}{r.subType ? ` · ${r.subType}` : ''}</Text>
          <View style={s.acts}>
            <TouchableOpacity disabled={busy === r.bookingId} style={[s.btn, s.btnP]} onPress={() => respond(r.bookingId, 'accept')}><Text style={s.btnPT}>수락</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy === r.bookingId} style={[s.btn, s.btnG]} onPress={() => respond(r.bookingId, 'reject')}><Text style={s.btnGT}>거절</Text></TouchableOpacity>
          </View>
        </View>
      ))}

      {show('q') && d.questions.map((q) => (
        <View key={q.id} style={[s.card, s.cardNew, wide && s.half]}>
          <View style={s.row}><Text style={s.title}>{q.studentName} · 질문{q.assigned ? '(지정)' : ''}</Text><Text style={s.time}>{KST(q.createdAt)}</Text></View>
          {q.body ? <Text style={s.body} numberOfLines={ansFor === q.id ? undefined : 3}>{q.body}</Text> : null}
          {ansFor === q.id ? (
            <View style={{ gap: 8 }}>
              <TextInput style={s.input} value={ansText} onChangeText={setAnsText} placeholder="답변을 입력하세요" placeholderTextColor={C.caption} multiline />
              <View style={s.acts}>
                <TouchableOpacity style={[s.btn, s.btnG]} onPress={() => { setAnsFor(null); setAnsText(''); }}><Text style={s.btnGT}>취소</Text></TouchableOpacity>
                <TouchableOpacity disabled={busy === q.id || !ansText.trim()} style={[s.btn, s.btnP]} onPress={() => answer(q)}><Text style={s.btnPT}>답변 등록</Text></TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={s.acts}><TouchableOpacity style={[s.btn, s.btnP]} onPress={() => { setAnsFor(q.id); setAnsText(''); }}><Text style={s.btnPT}>답변하기</Text></TouchableOpacity></View>
          )}
        </View>
      ))}

      {show('noti') && d.notifications.filter((n) => !n.readAt).map((n) => (
        <View key={n.id} style={[s.card, wide && s.half]}>
          <View style={s.row}><Text style={s.title}>{n.title ?? '알림'}</Text><Text style={s.time}>{KST(n.createdAt)}</Text></View>
          {n.body ? <Text style={s.body}>{n.body}</Text> : null}
        </View>
      ))}
      </View>
    </ScrollView>
  );
}

/** ② 상담 — 내 예약(진행 예정/오늘). 탭 → 채팅·화이트보드로 진행. */
export function TeacherSessions({ myId }: { myId: string }) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const wide = useWindowDimensions().width >= 900;
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'done'>('upcoming');
  const host = useSessionHost();
  const [sel, setSel] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});

  const load = useCallback(() => {
    api.get<{ data?: Booking[] } | Booking[]>('/bookings?role=teacher').then((r) => setBookings(unwrap(r))).catch(() => setBookings([]));
    api.get<Record<string, number>>('/chat/unread').then(setUnread).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const UP = new Set(['new', 'confirmed']);
  const all = bookings ?? [];
  const shown = all.filter((b) => (tab === 'upcoming' ? UP.has(b.status) : b.status === 'done'));

  // 다중 세션 몰입형 오버레이(채팅·화이트보드·음성 통합). 활성 세션이 있으면 위에 뜸.
  if (host.activeId) return <SessionHost host={host} myId={myId} onClosed={load} />;
  if (bookings === null) return <Center C={C} />;

  const sess = (b: Booking) => ({ id: b.id, title: `${b.consultType ?? '상담'} · ${modeLabel(b.mode)}`, sub: KST(b.start) });
  const launch = (b: Booking) => (
    <View style={s.acts}>
      {b.mode === 'zoom' && b.meetingUrl && (
        <TouchableOpacity style={[s.btn, s.btnP]} onPress={() => Linking.openURL(b.meetingUrl!)}><Text style={s.btnPT}>🎥 줌 입장</Text></TouchableOpacity>
      )}
      <TouchableOpacity style={[s.btn, s.btnP]} onPress={() => host.openSession(sess(b), 'chat')}><Text style={s.btnPT}>💬 채팅{(unread[b.id] ?? 0) > 0 ? ` · ${unread[b.id]}` : ''}</Text></TouchableOpacity>
      <TouchableOpacity style={[s.btn, s.btnG]} onPress={() => host.openSession(sess(b), 'wb')}><Text style={s.btnGT}>🖊 화이트보드</Text></TouchableOpacity>
    </View>
  );

  const List = (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={s.h1}>상담</Text>
      {host.open.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={[s.body, { color: C.caption }]}>진행 중 상담 {host.open.length} — 눌러서 재개</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {host.open.map((o) => (
              <TouchableOpacity key={o.id} onPress={() => host.setActiveId(o.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: C.teal }}>
                <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', fontSize: 12, maxWidth: 160 }}>{o.title}</Text>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} onPress={() => host.close(o.id)}><Text style={{ color: '#CDE7F0', fontSize: 11, fontWeight: '800' }}>✕</Text></TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      <View style={s.seg}>
        {(['upcoming', 'done'] as const).map((t) => (
          <TouchableOpacity key={t} style={[s.segItem, tab === t && s.segOn]} onPress={() => setTab(t)}><Text style={[s.segT, tab === t && s.segTOn]}>{t === 'upcoming' ? '진행 예정' : '완료'}</Text></TouchableOpacity>
        ))}
      </View>
      {shown.length === 0 ? <Text style={s.empty}>{tab === 'upcoming' ? '예정된 상담이 없어요.' : '완료된 상담이 없어요.'}</Text> : shown.map((b) => (
        <TouchableOpacity key={b.id} activeOpacity={wide ? 0.7 : 1} onPress={() => wide && setSel(b.id)} style={[s.card, wide && sel === b.id && s.cardSel]}>
          <View style={s.row}><Text style={s.title}>{b.consultType ?? '상담'} · {modeLabel(b.mode)}</Text><Text style={s.time}>{KST(b.start)}</Text></View>
          <Text style={s.body}>{modeLabel(b.mode)} · {statusLabel(b.status)}{(unread[b.id] ?? 0) > 0 ? ` · 새 메시지 ${unread[b.id]}` : ''}</Text>
          {!wide && b.status === 'confirmed' && launch(b)}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  if (wide) {
    const cur = shown.find((b) => b.id === sel) ?? shown[0];
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 360, borderRightWidth: 1, borderRightColor: C.line }}>{List}</View>
        <View style={{ flex: 1, padding: 20, gap: 12 }}>
          {cur ? <>
            <Text style={s.h1}>{cur.consultType ?? '상담'}</Text>
            <View style={s.card}>
              <Text style={s.body}>{modeLabel(cur.mode)} · {statusLabel(cur.status)}</Text>
              <Text style={s.body}>{KST(cur.start)}</Text>
              {cur.content ? <Text style={s.body}>{cur.content}</Text> : null}
            </View>
            {cur.status === 'confirmed' ? launch(cur) : <Text style={s.body}>{cur.status === 'new' ? '학생 신청 — 인박스에서 수락하세요.' : '진행 가능한 상태가 아니에요.'}</Text>}
            <Text style={[s.body, { color: C.caption }]}>채팅·화이트보드에서 사진 촬영·필기·음성통화를 함께 사용할 수 있어요.</Text>
          </> : <View style={s.paneEmpty}><Text style={s.empty}>좌측에서 상담을 선택하세요.</Text></View>}
        </View>
      </View>
    );
  }
  return List;
}

type TStudent = { studentId: string; name: string; totalConsult: number; isHomeroom: boolean };
type Detail = { kind: 'edit'; booking: Booking } | { kind: 'student'; student: TStudent } | null;

/** ③ 기록 — 예약별 작성/수정 · 학생별 히스토리. 태블릿(넓은 폭)은 좌 목록 + 우 상세 2-pane. */
export function TeacherRecords() {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const wide = useWindowDimensions().width >= 900;
  const [mode, setMode] = useState<'booking' | 'student'>('booking');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [students, setStudents] = useState<TStudent[] | null>(null);
  const [detail, setDetail] = useState<Detail>(null);

  const [queued, setQueued] = useState(0);
  const load = useCallback(() => {
    api.get<{ data?: Booking[] } | Booking[]>('/bookings?role=teacher').then((r) => setBookings(unwrap(r))).catch(() => setBookings([]));
    api.get<{ data?: TStudent[] } | TStudent[]>('/me/students').then((r) => setStudents(unwrap(r))).catch(() => setStudents([]));
  }, []);
  useEffect(() => {
    load();
    flushNotes().then((n) => { if (n) load(); setQueued(queuedCount()); }); // 진입 시 대기분 동기화
    return onlineFlush(() => { load(); setQueued(queuedCount()); }); // 온라인 복귀 시 자동
  }, [load]);

  const detailNode = detail?.kind === 'edit'
    ? <NoteEditor booking={detail.booking} embedded={wide} onClose={() => { setDetail(null); load(); setQueued(queuedCount()); }} />
    : detail?.kind === 'student'
      ? <StudentNotes student={detail.student} embedded={wide} onClose={() => setDetail(null)} onOpen={(b) => setDetail({ kind: 'edit', booking: b })} />
      : null;

  // 좁은 화면: 상세가 있으면 상세만 전체화면
  if (!wide && detailNode) return detailNode;
  if (bookings === null || students === null) return <Center C={C} />;

  const targets = (bookings ?? []).filter((b) => ['confirmed', 'done'].includes(b.status));
  const List = (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={s.h1}>상담기록</Text>
      {queued > 0 && <Text style={s.msg}>📡 동기화 대기 {queued}건 — 연결되면 자동 반영돼요.</Text>}
      <View style={s.seg}>
        {(['booking', 'student'] as const).map((m) => (
          <TouchableOpacity key={m} style={[s.segItem, mode === m && s.segOn]} onPress={() => { setMode(m); setDetail(null); }}><Text style={[s.segT, mode === m && s.segTOn]}>{m === 'booking' ? '예약별' : '학생별'}</Text></TouchableOpacity>
        ))}
      </View>
      {mode === 'booking' ? (
        targets.length === 0 ? <Text style={s.empty}>기록할 상담이 없어요.</Text> : targets.map((b) => (
          <TouchableOpacity key={b.id} style={[s.card, detail?.kind === 'edit' && detail.booking.id === b.id && s.cardSel]} onPress={() => setDetail({ kind: 'edit', booking: b })}>
            <View style={s.row}><Text style={s.title}>{b.studentName ?? `학생 ${b.studentId.slice(0, 6)}`} · {b.consultType ?? '상담'}</Text><Text style={s.time}>{KST(b.start)}</Text></View>
            <Text style={s.body}>{modeLabel(b.mode)} · {statusLabel(b.status)} · 기록 {b.status === 'done' ? '완료' : '작성/수정'} ›</Text>
          </TouchableOpacity>
        ))
      ) : (
        (students ?? []).length === 0 ? <Text style={s.empty}>담당 학생이 없어요.</Text> : (students ?? []).map((st) => (
          <TouchableOpacity key={st.studentId} style={[s.card, detail?.kind === 'student' && detail.student.studentId === st.studentId && s.cardSel]} onPress={() => setDetail({ kind: 'student', student: st })}>
            <View style={s.row}><Text style={s.title}>{st.name}{st.isHomeroom ? ' · 담임' : ''}</Text><Text style={s.time}>기록 {st.totalConsult}건 ›</Text></View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  if (wide) return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ width: 360, borderRightWidth: 1, borderRightColor: C.line }}>{List}</View>
      <View style={{ flex: 1 }}>{detailNode ?? <View style={s.paneEmpty}><Text style={s.empty}>좌측에서 상담·학생을 선택하세요.</Text></View>}</View>
    </View>
  );
  return List;
}

type SNote = { bookingId: string; teacherName?: string | null; consultType?: string | null; coreSummary: string | null; homework: string | null; futureDir: string | null; saveState: 'draft' | 'final'; createdAt?: string };
/** 학생별 상담기록 히스토리. */
function StudentNotes({ student, embedded, onClose, onOpen }: { student: TStudent; embedded: boolean; onClose: () => void; onOpen: (b: Booking) => void }) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const [notes, setNotes] = useState<SNote[] | null>(null);
  useEffect(() => { api.get<{ data?: SNote[] } | SNote[]>(`/students/${student.studentId}/notes`).then((r) => setNotes(unwrap(r))).catch(() => setNotes([])); }, [student.studentId]);
  if (notes === null) return <Center C={C} />;
  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      {!embedded && <TouchableOpacity onPress={onClose}><Text style={s.back}>‹ 상담기록</Text></TouchableOpacity>}
      <Text style={s.h1}>{student.name} · 기록</Text>
      {notes.length === 0 ? <Text style={s.empty}>작성된 기록이 없어요.</Text> : notes.map((n) => (
        <TouchableOpacity key={n.bookingId} style={s.card} onPress={() => onOpen({ id: n.bookingId, studentId: student.studentId, teacherId: '', consultType: n.consultType ?? null, mode: '', direction: 'student', start: n.createdAt ?? null, end: null, status: 'confirmed', chargedCredits: 0 })}>
          <View style={s.row}>
            <Text style={s.title}>{n.consultType ?? '상담'}</Text>
            <Text style={[s.pill, n.saveState === 'final' ? s.pillFinal : s.pillDraft]}>{n.saveState === 'final' ? '최종' : '임시'}</Text>
          </View>
          {n.coreSummary ? <Text style={s.body} numberOfLines={2}>{n.coreSummary}</Text> : <Text style={[s.body, { color: C.caption }]}>요약 없음</Text>}
          <Text style={s.time}>{KST(n.createdAt)}{n.teacherName ? ` · ${n.teacherName}` : ''}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function NoteEditor({ booking, onClose, embedded }: { booking: Booking; onClose: () => void; embedded?: boolean }) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const [f, setF] = useState({ coreSummary: '', homework: '', futureDir: '', memo: '' });
  const [guardianVisible, setGV] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get<{ coreSummary?: string | null; homework?: string | null; futureDir?: string | null; memo?: string | null; guardianVisible?: boolean }>(`/bookings/${booking.id}/note`)
      .then((n) => { if (n) { setF({ coreSummary: n.coreSummary ?? '', homework: n.homework ?? '', futureDir: n.futureDir ?? '', memo: n.memo ?? '' }); if (typeof n.guardianVisible === 'boolean') setGV(n.guardianVisible); } })
      .catch(() => {});
  }, [booking.id]);

  async function save(saveState: 'draft' | 'final') {
    setBusy(true); setMsg('');
    const payload = { ...f, guardianVisible, saveState };
    const offline = typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine;
    if (offline) { queueNote(booking.id, payload, 0); setMsg('오프라인 — 저장을 예약했어요. 연결되면 자동 동기화됩니다.'); setBusy(false); return; }
    try {
      await api.put(`/bookings/${booking.id}/note`, payload);
      if (saveState === 'final' && booking.status === 'confirmed') {
        await api.patch(`/bookings/${booking.id}/complete`, {}).catch(() => {});
      }
      setMsg(saveState === 'final' ? '최종 저장했어요. 상담이 완료 처리됩니다.' : '임시저장했어요.');
      if (saveState === 'final') setTimeout(onClose, 700);
    } catch (e) {
      // 네트워크성 실패(비검증)면 큐에 예약
      if (!(e instanceof ApiError)) { queueNote(booking.id, payload, 0); setMsg('저장 실패 — 오프라인 큐에 예약했어요. 연결되면 동기화됩니다.'); }
      else setMsg(e.message);
    }
    finally { setBusy(false); }
  }

  const Field = ({ label, k, ph }: { label: string; k: keyof typeof f; ph: string }) => (
    <View style={s.field}>
      <Text style={s.fieldL}>{label}</Text>
      <TextInput style={s.input} value={f[k]} onChangeText={(v) => set(k, v)} placeholder={ph} placeholderTextColor={C.caption} multiline />
    </View>
  );
  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      {!embedded && <TouchableOpacity onPress={onClose}><Text style={s.back}>‹ 상담기록</Text></TouchableOpacity>}
      <Text style={s.h1}>기록 작성</Text>
      {Field({ label: '핵심요약 (공개)', k: 'coreSummary', ph: '예: 합성함수 미분 개념 재정리' })}
      {Field({ label: '숙제 (공개)', k: 'homework', ph: '예: 유형서 32–40번' })}
      {Field({ label: '향후 방향 (공개)', k: 'futureDir', ph: '예: 도함수 활용 심화' })}
      {Field({ label: '메모 (내부)', k: 'memo', ph: '내부 참고 메모' })}
      <TouchableOpacity style={s.toggle} onPress={() => setGV((v) => !v)}>
        <Text style={s.toggleT}>보호자 공개</Text>
        <View style={[s.sw, !guardianVisible && s.swOff]}><View style={[s.knob, !guardianVisible && s.knobOff]} /></View>
      </TouchableOpacity>
      {msg ? <Text style={s.msg}>{msg}</Text> : null}
      <View style={s.acts}>
        <TouchableOpacity disabled={busy} style={[s.btn, s.btnG]} onPress={() => save('draft')}><Text style={s.btnGT}>임시저장</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} style={[s.btn, s.btnP]} onPress={() => save('final')}><Text style={s.btnPT}>최종 저장 → 완료</Text></TouchableOpacity>
      </View>
      {/* 상담 기록을 원천으로 학생·학부모 2뷰 리포트 생성·검수·발송(웹 파리티) */}
      <TeacherReportPanel bookingId={booking.id} />
    </ScrollView>
  );
}

const won = (n?: number | null) => (n == null ? '-' : `${Math.round(n).toLocaleString('ko-KR')}원`);
const sameDay = (iso: string | null, d: Date) => { if (!iso) return false; const a = new Date(iso); return a.getFullYear() === d.getFullYear() && a.getMonth() === d.getMonth() && a.getDate() === d.getDate(); };

/** 오늘·일정 — 오늘 상담·이번 주 예정 + 근무 상태. */
const WORK: { k: string; label: string }[] = [{ k: 'on', label: '근무중' }, { k: 'rest', label: '휴게중' }, { k: 'off', label: '퇴근' }];
export function TeacherToday({ myId }: { myId: string }) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const host = useSessionHost();
  const [work, setWork] = useState<string>('on');
  const load = useCallback(() => { api.get<{ data?: Booking[] } | Booking[]>('/bookings?role=teacher').then((r) => setBookings(unwrap(r))).catch(() => setBookings([])); }, []);
  useEffect(() => { load(); api.get<{ workStatus?: string }>('/teachers/me/profile').then((p) => setWork(p.workStatus ?? 'on')).catch(() => {}); }, [load]);
  async function setStatus(k: string) { setWork(k); api.patch('/teachers/me/status', { status: k }).catch(() => {}); }
  if (host.activeId) return <SessionHost host={host} myId={myId} onClosed={load} />;
  if (bookings === null) return <Center C={C} />;
  const now = new Date();
  const all = bookings ?? [];
  const active = new Set(['new', 'confirmed']);
  const today = all.filter((b) => sameDay(b.start, now)).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const doneToday = today.filter((b) => b.status === 'done').length;
  const upcoming = all.filter((b) => active.has(b.status) && b.start && new Date(b.start) > now && !sameDay(b.start, now))
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')).slice(0, 20);
  const nextSession = today.find((b) => active.has(b.status) && b.start && new Date(b.start) >= now) ?? upcoming[0];
  const ongoing = today.find((b) => b.status === 'confirmed' && b.start && b.end && new Date(b.start) <= now && new Date(b.end) >= now);
  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={s.h1}>오늘</Text>
      <View style={s.seg}>
        {WORK.map((w) => (
          <TouchableOpacity key={w.k} style={[s.segItem, work === w.k && (w.k === 'rest' ? { backgroundColor: '#CF9A3A' } : w.k === 'off' ? { backgroundColor: C.line } : s.segOn)]} onPress={() => setStatus(w.k)}>
            <Text style={[s.segT, work === w.k && (w.k === 'on' ? s.segTOn : { color: w.k === 'rest' ? '#5A3A00' : C.ink })]}>{w.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[s.card, { backgroundColor: ongoing ? C.teal : C.white, borderColor: ongoing ? C.teal : C.line }]}>
        <Text style={{ fontSize: 12.5, color: ongoing ? '#CDE7F0' : C.muted }}>{ongoing ? '상담 진행 중' : nextSession ? '다음 상담' : '오늘 상태'}</Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: ongoing ? '#fff' : C.ink, marginTop: 3 }}>
          {ongoing ? `${ongoing.consultType ?? '상담'} 진행 중` : nextSession ? `${KST(nextSession.start)} · ${nextSession.consultType ?? '상담'}` : '예정된 상담이 없어요'}
        </Text>
      </View>
      <View style={s.summary}>
        <Sum label="오늘 상담" n={today.length} C={C} />
        <Sum label="오늘 완료" n={doneToday} C={C} />
        <Sum label="이번 주 예정" n={upcoming.length} C={C} accent />
      </View>
      <Text style={s.secTitle}>오늘 일정</Text>
      {today.length === 0 ? <Text style={s.empty}>오늘 상담이 없어요.</Text> : today.map((b) => (
        <View key={b.id} style={s.card}>
          <View style={s.row}><Text style={s.title}>{KST(b.start)} · {b.consultType ?? '상담'}</Text><Text style={s.time}>{statusLabel(b.status)}</Text></View>
          <Text style={s.body}>{modeLabel(b.mode)}</Text>
          {b.status === 'confirmed' && <View style={s.acts}><TouchableOpacity style={[s.btn, s.btnP]} onPress={() => host.openSession({ id: b.id, title: `${b.consultType ?? '상담'} · ${modeLabel(b.mode)}`, sub: KST(b.start) }, 'chat')}><Text style={s.btnPT}>💬 상담 시작</Text></TouchableOpacity></View>}
        </View>
      ))}
      {upcoming.length > 0 && <><Text style={s.secTitle}>이번 주 예정</Text>{upcoming.map((b) => (
        <View key={b.id} style={s.card}><View style={s.row}><Text style={s.title}>{b.consultType ?? '상담'} · {modeLabel(b.mode)}</Text><Text style={s.time}>{KST(b.start)}</Text></View></View>
      ))}</>}
    </ScrollView>
  );
}

type Prof = { name?: string; subjects?: string[]; grade?: string; career?: string | null; centerName?: string | null; intro?: string | null; strengths?: string[] | null };
type Evals = { overall: number; count: number; grade: string; topPercent: number | null; itemScores?: { attitude: number; content: number; skill: number; again: number } };
type Pay = { expectedAmount: number; confirmedAmount: number; incentive: number; rates?: { employmentType?: string | null; basePay?: number } };

/** 마이 — 프로필·응답률·완성도·평점·예상급여. */
export function TeacherMy({ myId }: { myId: string }) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const [prof, setProf] = useState<Prof | null>(null);
  const [ev, setEv] = useState<Evals | null>(null);
  const [pay, setPay] = useState<Pay | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  useEffect(() => {
    api.get<Prof>('/teachers/me/profile').then(setProf).catch(() => {});
    api.get<Evals>('/me/evaluations').then(setEv).catch(() => {});
    api.get<Pay>(`/teachers/${myId}/payroll`).then(setPay).catch(() => {});
    api.get<{ data?: Booking[] } | Booking[]>('/bookings?role=teacher').then((r) => setBookings(unwrap(r))).catch(() => setBookings([]));
  }, [myId]);

  // 응답률: 상대(학생) 신청 중 내가 처리(new 아님)한 비율
  const reqs = (bookings ?? []).filter((b) => b.direction === 'student');
  const responded = reqs.filter((b) => b.status !== 'new').length;
  const responseRate = reqs.length ? Math.round((responded / reqs.length) * 100) : null;
  // 프로필 완성도: 과목·경력·소개·강점 채움 비율
  const filled = [(prof?.subjects?.length ?? 0) > 0, !!prof?.career, !!prof?.intro, (prof?.strengths?.length ?? 0) > 0];
  const completeness = prof ? Math.round((filled.filter(Boolean).length / filled.length) * 100) : null;

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={s.h1}>마이</Text>
      <View style={s.card}>
        <View style={s.row}><Text style={s.title}>{prof?.name ?? '선생님'}</Text><Text style={s.gradeBadge}>{ev?.grade ?? prof?.grade ?? 'B'}급</Text></View>
        <Text style={s.body}>{(prof?.subjects ?? []).join(', ') || '과목 미설정'}{prof?.centerName ? ` · ${prof.centerName}` : ''}</Text>
        {prof?.career ? <Text style={s.body}>{prof.career}</Text> : null}
      </View>
      <View style={s.summary}>
        <Sum label="응답률" n={responseRate ?? 0} C={C} accent suffix="%" />
        <Sum label="프로필 완성도" n={completeness ?? 0} C={C} suffix="%" />
      </View>
      {completeness != null && completeness < 100 && (
        <Text style={[s.msg]}>프로필을 채우면 매칭·랭킹에 유리해요{prof && !prof.intro ? ' · 소개 미작성' : ''}{prof && !(prof.strengths?.length) ? ' · 강점 미설정' : ''}.</Text>
      )}
      <View style={s.card}>
        <Text style={s.secTitle}>평점 · 리뷰</Text>
        <View style={s.row}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: C.ink }}>⭐ {ev?.overall ?? 0}</Text>
          <Text style={s.body}>리뷰 {ev?.count ?? 0}건{ev?.topPercent != null ? ` · 상위 ${ev.topPercent}%` : ''}</Text>
        </View>
        {ev?.itemScores && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {([['태도', ev.itemScores.attitude], ['내용', ev.itemScores.content], ['실력', ev.itemScores.skill], ['재상담', ev.itemScores.again]] as const).map(([k, v]) => (
              <View key={k} style={s.metric}><Text style={s.metricL}>{k}</Text><Text style={s.metricV}>{v}</Text></View>
            ))}
          </View>
        )}
      </View>
      <View style={s.card}>
        <Text style={s.secTitle}>이번 달 예상급여</Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: C.teal }}>{won(pay?.expectedAmount)}</Text>
        <Text style={s.body}>확정분 {won(pay?.confirmedAmount)}{pay?.incentive ? ` · 인센티브 ${won(pay.incentive)}` : ''}</Text>
        {pay?.rates?.employmentType ? <Text style={[s.body, { color: C.caption }]}>고용형태 {pay.rates.employmentType}</Text> : null}
      </View>
    </ScrollView>
  );
}

// ── 보조 ──
function Center({ C }: { C: Palette }) { return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={C.teal} /></View>; }
function Sum({ label, n, C, accent, suffix }: { label: string; n: number; C: Palette; accent?: boolean; suffix?: string }) {
  return <View style={{ flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12 }}>
    <Text style={{ fontSize: 11.5, color: C.muted }}>{label}</Text>
    <Text style={{ fontSize: 22, fontWeight: '800', color: accent ? C.teal : C.ink, marginTop: 2 }}>{n}{suffix ?? ''}</Text>
  </View>;
}
const modeLabel = (m: string) => ({ chat: '실시간 채팅', zoom: '줌 화상', hand: '필기 공유', offline: '오프라인 대면', board: '게시판' }[m] ?? m);
const statusLabel = (st: string) => ({ new: '신청됨', confirmed: '확정', done: '완료', cancelled: '취소', rejected: '거절', noshow: '노쇼' }[st] ?? st);

const mk = (C: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  h1: { fontSize: 22, fontWeight: '800', color: C.ink },
  sub: { fontSize: 13, color: C.muted, lineHeight: 19, marginTop: -2 },
  summary: { flexDirection: 'row', gap: 10 },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 13, gap: 6 },
  cardNew: { borderColor: C.teal100 ?? C.teal, backgroundColor: C.teal50 ?? C.white },
  cardSel: { borderColor: C.teal, borderWidth: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  half: { width: '48.6%' },
  paneEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  pill: { fontSize: 10.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  pillFinal: { color: '#fff', backgroundColor: C.teal },
  pillDraft: { color: C.muted, backgroundColor: C.lineSoft },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 14.5, fontWeight: '800', color: C.ink, flex: 1 },
  time: { fontSize: 11, color: C.caption },
  body: { fontSize: 13, color: C.muted, lineHeight: 18 },
  acts: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  btnP: { backgroundColor: C.teal }, btnPT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnG: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line }, btnGT: { color: C.teal, fontWeight: '800', fontSize: 13 },
  empty: { fontSize: 13.5, color: C.caption, textAlign: 'center', paddingVertical: 40 },
  msg: { fontSize: 13, color: C.teal, backgroundColor: C.teal50 ?? C.white, borderRadius: 8, padding: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: C.teal, borderColor: C.teal },
  chipT: { fontSize: 12.5, fontWeight: '700', color: C.muted },
  seg: { flexDirection: 'row', backgroundColor: C.lineSoft, borderRadius: 10, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segOn: { backgroundColor: C.white },
  segT: { fontSize: 13, fontWeight: '700', color: C.muted }, segTOn: { color: C.teal },
  field: { gap: 5 },
  fieldL: { fontSize: 12, fontWeight: '700', color: C.muted },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 11, fontSize: 14, color: C.ink, minHeight: 44 },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 12 },
  toggleT: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  sw: { width: 42, height: 24, borderRadius: 999, backgroundColor: C.teal, justifyContent: 'center' },
  swOff: { backgroundColor: C.line },
  knob: { width: 18, height: 18, borderRadius: 999, backgroundColor: '#fff', alignSelf: 'flex-end', marginRight: 3 },
  knobOff: { alignSelf: 'flex-start', marginLeft: 3 },
  back: { fontSize: 14, color: C.teal, fontWeight: '700' },
  secTitle: { fontSize: 13, fontWeight: '800', color: C.muted, marginTop: 2 },
  gradeBadge: { fontSize: 12, fontWeight: '800', color: '#fff', backgroundColor: C.teal, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  metric: { backgroundColor: C.lineSoft, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 12, alignItems: 'center', minWidth: 64 },
  metricL: { fontSize: 11, color: C.muted },
  metricV: { fontSize: 15, fontWeight: '800', color: C.ink, marginTop: 1 },
});
