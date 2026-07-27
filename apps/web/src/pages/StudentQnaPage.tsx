import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, TextareaField, SelectField } from '../components/ui';
import { AuthImage } from '../components/AuthImage';
import { SchoolRecordUploadNotice } from '../components/SchoolRecordGuard';
import { track } from '../utils/track';

// P3 — 유사 질문 제안
type SimItem = { id: string; subject: string | null; similarity: number; bodyPreview: string; answerPreview: string };
type SimDetail = { id: string; subject: string | null; body: string; createdAt: string; answers: { body: string; accepted: boolean; teacherName: string }[] };

type Attachment = { id: string; name: string; type?: string };
type Followup = { id: string; byTeacher: boolean; body: string; createdAt: string };
type Answer = { id: string; body: string; accepted: boolean; teacherName: string; teacherId?: string | null; createdAt?: string; escalationOk?: boolean; attachments?: Attachment[]; followups?: Followup[] };
type Post = {
  id: string;
  subject: string | null;
  difficulty: string | null;
  scope: string;
  body: string;
  status: string;
  /** 요금 티어 — API 는 camelCase 로 준다. 구 `q_type` 은 응답에 없던 이름이라 항상 undefined 였다. */
  qType?: 'general' | 'item' | string | null;
  created_at: string;
  rating?: number | null;
  continuePref?: boolean | null;
  aiDraft?: string | null;
  claimedAt?: string | null;
  firstReplyAt?: string | null;
  assignedTeacherId?: string | null;
  attachments?: Attachment[];
  answers?: Answer[];
};
type Block = { teacherId: string; teacherName: string; since: string };
type TeacherDir = { teacherId: string; name: string; avgFirstReplyMin: number | null; avgRating: number | null; answers: number; accepted: number; escalationOk?: boolean; subjects?: string[]; favorite?: boolean };
const isImage = (a: Attachment) => (a.type ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.name);
/** 시각 표시 — 오늘이면 "14:32", 아니면 "7/20 14:32" (KST). */
const T = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const hm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
  const today = new Date().toDateString() === d.toDateString();
  return today ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};
const MAX_IMG = 3;

// P6 — 교과 + 비교과(학습법·입시·진로). 비교과는 입시 컨설턴트 풀로 매칭.
const SUBJECTS = ['국어', '수학', '영어', '탐구', '학습법', '입시', '진로'];
const NON_ACADEMIC = ['학습법', '입시', '진로'];

/** Q1 해결 피드백 — 별점 + "계속 받을까요". 그만 받으면 소프트 블록. */
function FeedbackPanel({ onSubmit }: { onSubmit: (rating: number, cont: boolean) => void }) {
  const [r, setR] = useState(0);
  return (
    <div style={{ borderTop: '1px dashed var(--input-border)', marginTop: 8, paddingTop: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>이 답변, 어떠셨어요?</div>
      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setR(n)} aria-label={`${n}점`} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: n <= r ? '#CF9A3A' : '#d4dbe4', padding: 0, lineHeight: 1 }}>★</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button size="sm" disabled={r === 0} onClick={() => onSubmit(r, true)}>이 선생님께 계속 받을게요</Button>
        <button type="button" disabled={r === 0} onClick={() => onSubmit(r, false)}
          style={{ fontSize: 12.5, border: '1px solid var(--input-border)', background: 'var(--surface)', borderRadius: 8, padding: '6px 12px', cursor: r === 0 ? 'not-allowed' : 'pointer', color: 'var(--muted)' }}>그만 받을게요</button>
      </div>
    </div>
  );
}

export function StudentQnaPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ subject: '수학', qType: 'general', scope: 'open', difficulty: '중', body: '' });
  const [atts, setAtts] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  // 난이도별 답변블록 시간(정책) + 질문 요금(정책)
  const [durPol, setDurPol] = useState<Record<string, number> | null>(null);
  const [teachers, setTeachers] = useState<TeacherDir[]>([]); // P5 — 지정 질문 선생님 디렉터리(SLA 배지)
  const [assignedTeacherId, setAssignedTeacherId] = useState('');
  // O95 — 유예 채팅 CTA 이월: ?teacher=&draft= 로 진입하면 지정 질문 폼을 프리필해 연다(쓰던 내용 보존).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('teacher'); const d = q.get('draft');
    if (!t && !d) return;
    if (t) { setAssignedTeacherId(t); setF((p) => ({ ...p, scope: 'assigned', body: d ?? p.body })); }
    else if (d) setF((p) => ({ ...p, body: d }));
    setOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [escOnly, setEscOnly] = useState(false); // 이어서 상담 가능한 선생님만 보기
  const [favOnly, setFavOnly] = useState(false); // F2 — 찜한 선생님만 보기
  // F1 — 폼 과목과 선생님 과목 매칭(탐구=과학·사회, 비교과=입시 컨설턴트 풀)
  const subjectMatch = (t: TeacherDir) => {
    const subs = t.subjects ?? [];
    if (!subs.length) return true; // 과목 미설정 선생님은 전 과목 취급
    if (f.subject === '탐구') return subs.some((x) => ['과학', '사회', '탐구'].includes(x));
    // P6 — 학습법·입시·진로는 해당 카테고리 또는 '입시'(컨설턴트)를 가진 선생님과 매칭.
    if (NON_ACADEMIC.includes(f.subject)) return subs.some((x) => [f.subject, '입시'].includes(x));
    return subs.includes(f.subject);
  };
  async function toggleFav(t: TeacherDir) {
    try {
      await api.post('/qna/favorites', { teacherId: t.teacherId, favored: !t.favorite });
      setTeachers((p) => p.map((x) => (x.teacherId === t.teacherId ? { ...x, favorite: !t.favorite } : x)));
    } catch { /* 무시 */ }
  }
  type FeeInfo = { itemFee: number; generalFee: number; freeQuota?: { quota: number; used: number; remaining: number; resetsAt: string } | null; ticketRemaining?: number | null; expectedFirstReplyMin?: number | null };
  const [fee, setFee] = useState<FeeInfo | null>(null);
  type TicketProduct = { count: number; discountPct: number; price: number; unitPrice: number; listPrice: number };
  const [ticketProducts, setTicketProducts] = useState<TicketProduct[]>([]);
  useEffect(() => {
    api.get<Record<string, number>>('/bookings/question-duration/policy').then(setDurPol).catch(() => { /* 기본값 */ });
    api.get<FeeInfo>('/qna/pricing').then(setFee).catch(() => { /* 요금 조회 실패 */ });
    api.get<{ remaining: number; products: TicketProduct[] }>('/qna/tickets').then((r) => setTicketProducts(r.products ?? [])).catch(() => { /* 상품 조회 실패 */ });
    loadTeachers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // B1 — 질문권 묶음 구매(크레딧 선차감). 성공 시 요금 정보 재조회로 잔여 반영.
  async function buyTickets(p: TicketProduct) {
    if (!confirm(`질문권 ${p.count}회 묶음을 구매할까요?\n\n· 가격: ${p.price.toLocaleString()} 크레딧 (정가 ${p.listPrice.toLocaleString()} → ${p.discountPct}% 할인)\n· 회당 ${p.unitPrice.toLocaleString()} 크레딧`)) return;
    setError(''); setMsg('');
    try {
      const r = await api.post<{ ticketRemaining: number; paid: number }>('/qna/tickets/purchase', { count: p.count });
      setMsg(`질문권 ${p.count}회 묶음을 구매했어요 — 보유 질문권 ${r.ticketRemaining}건.`);
      api.get<FeeInfo>('/qna/pricing').then(setFee).catch(() => { /* noop */ });
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 402 ? '크레딧이 부족합니다 — 결제요청이 생성되었어요.' : e.message) : '구매 실패');
    }
  }
  function loadTeachers() {
    api.get<{ teachers: TeacherDir[] }>('/qna/teachers').then((r) => setTeachers(r.teachers ?? [])).catch(() => { /* 디렉터리 조회 실패 */ });
  }
  const tierOf = (d: string) => (d === '하' ? '기초' : d === '상' ? '심화' : '중급');
  const blockMin = durPol?.[tierOf(f.difficulty)] ?? ({ 하: 10, 중: 20, 상: 30 } as Record<string, number>)[f.difficulty] ?? 20;

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    const files = Array.from(e.target.files ?? []).filter((x) => x.type.startsWith('image/'));
    if (!files.length) return;
    const room = MAX_IMG - atts.length;
    if (room <= 0) { setError(`이미지는 최대 ${MAX_IMG}장까지 첨부할 수 있어요.`); e.target.value = ''; return; }
    for (const file of files.slice(0, room)) {
      try {
        const form = new FormData(); form.append('file', file, file.name);
        const r = await api.upload<{ id: string; filename: string; contentType: string }>('/files', form);
        setAtts((p) => [...p, { id: r.id, name: r.filename, type: r.contentType }]);
      } catch (er) { setError(er instanceof ApiError ? er.message : '이미지 업로드 실패'); }
    }
    if (files.length > room) setError(`한 문항 기준 이미지는 ${MAX_IMG}장까지만 등록됩니다.`);
    e.target.value = '';
  }

  const [blocks, setBlocks] = useState<Block[]>([]);
  function loadBlocks() { api.get<{ blocks: Block[] }>('/qna/blocks').then((r) => setBlocks(r.blocks)).catch(() => { /* 무시 */ }); }
  function load() {
    api.get<Post[]>('/qna/posts').then(setPosts).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }
  useEffect(() => { load(); loadBlocks(); }, []);
  // 실시간 갱신 — 답변·후속문답 알림이 오면 목록 자동 리로드(새로고침 불필요).
  useEffect(() => {
    const h = (e: Event) => {
      const type = (e as CustomEvent<{ type?: string }>).detail?.type ?? '';
      if (['qna_answered', 'qna_claimed', 'qna_followup', 'qna_community_answer'].includes(type)) load();
    };
    const refresh = () => { load(); loadTeachers(); };
    window.addEventListener('janus:notif', h);
    window.addEventListener('janus:refresh', refresh); // 현재 탭 재클릭 = 새로고침
    return () => { window.removeEventListener('janus:notif', h); window.removeEventListener('janus:refresh', refresh); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [fuDraft, setFuDraft] = useState<Record<string, string>>({}); // C2 — 답변별 이어 묻기 초안
  async function sendFollowup(answerId: string) {
    const body = (fuDraft[answerId] ?? '').trim();
    if (!body) return;
    setError(''); setMsg('');
    try {
      const r = await api.post<{ moderationWarning?: string | null }>(`/qna/answers/${answerId}/followups`, { body });
      setMsg(r.moderationWarning ? `추가 질문을 보냈어요. ⚠️ ${r.moderationWarning}` : '추가 질문을 보냈어요 — 선생님이 이어서 답해드릴 거예요.');
      setFuDraft((d) => ({ ...d, [answerId]: '' })); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '전송 실패'); }
  }

  async function accept(answerId: string) {
    setError(''); setMsg('');
    try { await api.patch(`/qna/answers/${answerId}/accept`, {}); setMsg('답변을 채택했습니다.'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '채택 실패'); }
  }

  // Q1 해결 피드백 — 만족도 + 계속 여부(아니오면 서버가 소프트 블록).
  async function sendFeedback(postId: string, rating: number, continuePref: boolean) {
    setError(''); setMsg('');
    try {
      const r = await api.post<{ blockedTeacher: boolean }>(`/qna/posts/${postId}/feedback`, { rating, continuePref });
      setMsg(r.blockedTeacher ? '평가 완료 — 이 선생님께는 앞으로 노출되지 않습니다(직접 해제 가능).' : '평가해 주셔서 감사합니다.');
      load(); loadBlocks(); loadTeachers(); // "계속" 선택 시 자동 찜 → ★ 즉시 반영
    } catch (e) { setError(e instanceof ApiError ? e.message : '평가 실패'); }
  }
  async function unblock(teacherId: string) {
    try { await api.post('/qna/blocks', { teacherId, blocked: false }); setMsg('차단을 해제했습니다.'); loadBlocks(); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '해제 실패'); }
  }
  // 재답변 요청(불만족) — 이전 답변자 제외 후 재공개.
  async function reanswer(postId: string) {
    setError(''); setMsg('');
    const reason = window.prompt('재답변을 요청하는 이유가 있다면 적어주세요(선택).') ?? undefined;
    try {
      const r = await api.post<{ remaining: number }>(`/qna/posts/${postId}/reanswer`, { reason });
      setMsg(`재답변을 요청했어요(이전 답변자 제외). 남은 횟수 ${r.remaining}회.`);
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '재답변 요청 실패'); }
  }
  // 상담으로 이어가기 — 1차 호출로 가까운 후보 시간대를 받고, 학생이 고르면 2차 호출로 예약 확정.
  const [escCand, setEscCand] = useState<{ postId: string; minutes?: number; items: { dateStr: string; slotStart: number; label: string }[] } | null>(null);
  async function escalate(postId: string, pick?: { dateStr: string; slotStart: number }) {
    setError(''); setMsg('');
    try {
      const r = await api.post<{ bookingId?: string; message?: string; candidates?: { dateStr: string; slotStart: number; label: string }[]; minutes?: number }>(`/qna/posts/${postId}/escalate`, pick ?? {});
      if (r.bookingId) { setEscCand(null); setMsg('상담 예약이 생성됐어요. 예약 화면에서 확인하세요.'); load(); return; }
      if (r.candidates?.length) { setEscCand({ postId, minutes: r.minutes, items: r.candidates }); return; }
      setEscCand(null); setMsg(r.message ?? '상담 예약을 생성하지 못했어요.');
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '상담 승격 실패'); }
  }

  async function submit() {
    setError(''); setMsg('');
    if (!f.body.trim()) { setError('질문 내용을 입력하세요.'); return; }
    if (f.scope === 'assigned' && !assignedTeacherId) { setError('지정 질문은 선생님을 선택해야 합니다.'); return; }
    // 실수 등록 방지 — 첨부·과목을 요약해 한 번 더 확인(사진 올리다 등록되는 VOC 대비).
    if (!confirm(`이 상태로 질문을 등록할까요?\n\n· 과목: ${f.subject} (${f.scope === 'assigned' ? '지정' : '공개'} · 난이도 ${f.difficulty})\n· 사진 첨부: ${atts.length}장\n\n등록은 무료예요 — 질문권·크레딧은 [선생님 답변 받기]를 누를 때만 사용됩니다.`)) return;
    try {
      // P2: 등록은 무료(AI 1층) — 과금은 [선생님 답변 받기] 시점.
      const r = await api.post<{ moderationWarning?: string | null }>('/qna/posts', { subject: f.subject, qType: f.qType, scope: f.scope, difficulty: f.difficulty, body: f.body, attachments: atts, ...(f.scope === 'assigned' ? { assignedTeacherId } : {}) });
      const base = '질문이 등록됐어요 — AI 풀이가 곧 도착합니다. 부족하면 [선생님 답변 받기]를 눌러주세요.';
      setMsg(r.moderationWarning ? `${base} ⚠️ ${r.moderationWarning}` : base);
      setF({ ...f, body: '' }); setAtts([]); setSimilar([]); setOpen(false); load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '등록 실패');
    }
  }

  // P2 — AI 1층 퍼널 액션
  async function resolveAi(postId: string) {
    setError(''); setMsg('');
    try {
      await api.post(`/qna/posts/${postId}/resolve-ai`, {});
      track('qna_funnel', 'cta', 'ai_enough', { ev: 'ai_enough', postId });
      setMsg('AI 풀이로 해결했어요 — 무료 질문권·크레딧이 사용되지 않았습니다.'); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '처리 실패'); }
  }
  async function requestTeacher(postId: string) {
    setError(''); setMsg('');
    // 질문권·크레딧이 실제로 소진되는 지점 — 반드시 확인 받는다. 소진 순서: 주간무료→묶음→크레딧(B1).
    const freeLeft = fee?.freeQuota?.remaining ?? 0;
    const ticketLeft = fee?.ticketRemaining ?? 0;
    const cost = freeLeft > 0
      ? `무료 질문권 1건이 사용됩니다(이번 주 ${freeLeft}건 남음).`
      : ticketLeft > 0
        ? `보유 질문권 1건이 사용됩니다(${ticketLeft}건 보유).`
        // **이 질문의** 요금 티어로 금액을 말한다 — 예전엔 항상 generalFee 를 써서, 문항형(8,000)을
        // 골라 등록한 학생에게 4,000 을 안내했다(게시 화면의 표시와도 서로 어긋났다).
        : `크레딧 ${((posts?.find((p) => p.id === postId)?.qType === 'item' ? fee?.itemFee : fee?.generalFee) ?? 0).toLocaleString()}이 차감됩니다.`;
    if (!confirm(`선생님 답변을 요청할까요?\n\n${cost}`)) return;
    try {
      const r = await api.post<{ freeUsed?: boolean; freeRemaining?: number; usedTicket?: boolean; ticketRemaining?: number; chargedCredits?: number }>(`/qna/posts/${postId}/request-teacher`, {});
      track('qna_funnel', 'cta', 'human_requested', { ev: 'human_requested', postId });
      setMsg(r.freeUsed
        ? `선생님 답변을 요청했어요 — 무료 질문권 사용(이번 주 ${r.freeRemaining ?? 0}건 남음).`
        : r.usedTicket
          ? `선생님 답변을 요청했어요 — 보유 질문권 사용(${r.ticketRemaining ?? 0}건 남음).`
          : `선생님 답변을 요청했어요(${(r.chargedCredits ?? 0).toLocaleString()} 크레딧 차감).`);
      load();
      api.get<typeof fee>('/qna/pricing').then((v) => setFee(v)).catch(() => { /* noop */ });
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 402 ? '크레딧이 부족합니다 — 결제요청이 생성되었어요.' : e.message) : '요청 실패');
    }
  }

  // P3 — 작성 중 유사 질문 제안(디바운스)
  const [similar, setSimilar] = useState<SimItem[]>([]);
  const [simView, setSimView] = useState<SimDetail | null>(null);
  const simTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) return;
    if (simTimer.current) clearTimeout(simTimer.current);
    const body = f.body.trim();
    if (body.length < 12) { setSimilar([]); return; }
    simTimer.current = setTimeout(() => {
      api.post<{ items: SimItem[] }>('/qna/similar', { subject: f.subject, body })
        .then((r) => { setSimilar(r.items ?? []); if ((r.items ?? []).length) track('qna_funnel', 'view', undefined, { ev: 'similar_shown', n: r.items.length }); })
        .catch(() => setSimilar([]));
    }, 700);
    return () => { if (simTimer.current) clearTimeout(simTimer.current); };
  }, [f.body, f.subject, open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function openSimilar(id: string) {
    try {
      const d = await api.get<SimDetail>(`/qna/similar/${id}`);
      setSimView(d);
      track('qna_funnel', 'view', undefined, { ev: 'similar_opened', postId: id });
    } catch { /* 무시 */ }
  }

  return (
    <div>
      <PageHeader title="질문 게시판 (Q&A)" sub="선생님에게 질문을 남기고 답변을 받습니다. 공개 질문 또는 지정 질문(건당 크레딧)." />
      <div style={{ marginBottom: 12 }}>
        <Button onClick={() => setOpen((o) => !o)}>{open ? '닫기' : '질문 작성'}</Button>
      </div>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      {error && <ErrorText>{error}</ErrorText>}

      {open && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}><SelectField label="과목" value={f.subject} onChange={(e) => set('subject', e.target.value)} options={SUBJECTS.map((s) => ({ value: s, label: s }))} /></div>
            <div style={{ minWidth: 120 }}><SelectField label="유형" value={f.qType} onChange={(e) => set('qType', e.target.value)} options={[{ value: 'general', label: '일반' }, { value: 'item', label: '문항(고난도)' }]} /></div>
            <div style={{ minWidth: 120 }}><SelectField label="공개범위" value={f.scope} onChange={(e) => set('scope', e.target.value)} options={[{ value: 'open', label: '공개' }, { value: 'assigned', label: '지정' }]} /></div>
            <div style={{ minWidth: 100 }}><SelectField label="난이도" value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)} options={['하', '중', '상'].map((d) => ({ value: d, label: d }))} /></div>
          </div>
          {/* P6 — 진로·입시 질문은 배치표·진단 데이터와 함께면 답변이 깊어짐(버티컬 교차 CTA) */}
          {NON_ACADEMIC.includes(f.subject) && (
            <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--teal-50,#EEF4FB)', fontSize: 12.5, color: 'var(--ink-body)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>🎓 {f.subject} 질문은 입시 컨설턴트 선생님에게 연결돼요. 내 성적·배치 데이터를 먼저 만들어두면 답변이 훨씬 구체적이에요.</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <Link to="/student/placement/hub" style={{ fontWeight: 700, color: 'var(--teal)' }}>배치표 허브 →</Link>
                <Link to="/student/diagnostic" style={{ fontWeight: 700, color: 'var(--teal)' }}>실력진단 →</Link>
              </span>
            </div>
          )}
          {f.scope === 'assigned' && (
            <div style={{ marginTop: 8 }}>
              <label className="label">지정할 선생님 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— 평균 첫응답·만족도는 지정 질문 실적 기준</span></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer', margin: '2px 0 6px' }}>
                <input type="checkbox" checked={escOnly} onChange={(e) => setEscOnly(e.target.checked)} />
                답변 후 이어서 상담까지 가능한 선생님만 보기
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer', margin: '0 0 6px' }}>
                <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />
                ⭐ 찜한 선생님만 보기
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 8 }}>
                {teachers.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>선택 가능한 선생님이 없습니다.</span>}
                {teachers
                  .filter((t) => !escOnly || t.escalationOk !== false)
                  .filter((t) => !favOnly || t.favorite)
                  // F2 찜 우선 → F1 과목 일치 우선(기존 SLA 정렬은 서버 순서 유지)
                  .sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false) || Number(subjectMatch(b)) - Number(subjectMatch(a)))
                  .map((t) => (
                  <button key={t.teacherId} type="button" onClick={() => setAssignedTeacherId(t.teacherId)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: assignedTeacherId === t.teacherId ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', opacity: subjectMatch(t) ? 1 : 0.55 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span role="button" title={t.favorite ? '찜 해제' : '찜하기'} onClick={(e) => { e.stopPropagation(); void toggleFav(t); }} style={{ cursor: 'pointer', color: t.favorite ? '#CF9A3A' : '#d4dbe4', fontSize: 15 }}>★</span>
                      {t.name} 선생님
                      {!subjectMatch(t) && <span style={{ fontSize: 10.5, color: 'var(--caption)', fontWeight: 400 }}>다른 과목</span>}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {t.avgFirstReplyMin != null ? `⚡ 평균 첫응답 ${t.avgFirstReplyMin >= 60 ? `${Math.round(t.avgFirstReplyMin / 60)}시간` : `${t.avgFirstReplyMin}분`}` : '신규'}
                      {t.avgRating != null && ` · ★${t.avgRating}`}
                      {t.answers > 0 && ` · 답변 ${t.answers}건`}
                      {t.escalationOk !== false && ' · 💬 이어상담 가능'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--teal-50,#EEF4FB)', borderRadius: 8, padding: '8px 12px', marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal)' }}>답변블록 약 {blockMin}분</span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {fee?.freeQuota && fee.freeQuota.remaining > 0
                ? <>· <b style={{ color: 'var(--teal)' }}>이번 주 무료 질문 {fee.freeQuota.remaining}건 남음</b>(소진 후 건당 {(f.qType === 'item' ? fee?.itemFee : fee?.generalFee)?.toLocaleString() ?? '—'} 크레딧)</>
                : <>· 건당 {(f.qType === 'item' ? fee?.itemFee : fee?.generalFee)?.toLocaleString() ?? '—'} 크레딧{fee?.freeQuota && fee.freeQuota.quota > 0 ? ' · 이번 주 무료 질문권 소진' : ''}</>}
              {(fee?.ticketRemaining ?? 0) > 0 && <> · <b style={{ color: '#A97D24' }}>보유 질문권 {fee!.ticketRemaining}건</b></>}
              {fee?.expectedFirstReplyMin != null && <> · ⚡ 보통 첫 답변까지 약 {fee.expectedFirstReplyMin >= 60 ? `${Math.round(fee.expectedFirstReplyMin / 60)}시간` : `${fee.expectedFirstReplyMin}분`}</>}
              {' · '}난이도가 높을수록 답변블록이 길어져요.
            </span>
          </div>
          {/* B1 — 질문권 묶음 구매(할인 선구매). 소진 순서: 주간무료 → 묶음 → 크레딧 */}
          {ticketProducts.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5 }}>
              <span style={{ color: 'var(--muted)', fontWeight: 700 }}>🎟️ 질문권 묶음</span>
              {ticketProducts.map((p) => (
                <button key={p.count} type="button" onClick={() => void buyTickets(p)}
                  style={{ cursor: 'pointer', border: '1px solid #EDDCB8', background: 'var(--chip-confirmed-bg,#FAF1E2)', color: '#A97D24', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700 }}>
                  {p.count}회 {p.price.toLocaleString()}크레딧 ({p.discountPct}%↓)
                </button>
              ))}
            </div>
          )}
          <TextareaField label="질문 내용" rows={4} value={f.body} onChange={(e) => set('body', e.target.value)} placeholder="예: 미적분 30번, 합성함수 미분에서 왜 이렇게 전개되나요?" />

          {/* P3 — 비슷한 해결 질문 무료 열람 제안 */}
          {similar.length > 0 && (
            <div style={{ border: '1px solid var(--teal)', background: 'var(--teal-50,#EEF4FB)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--teal)', marginBottom: 6 }}>💡 비슷한 질문이 이미 해결됐어요 — 무료로 답변을 볼 수 있어요</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {similar.map((s) => (
                  <button key={s.id} type="button" onClick={() => openSimilar(s.id)}
                    style={{ textAlign: 'left', border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.subject ? `[${s.subject}] ` : ''}{s.bodyPreview}…</div>
                    {s.answerPreview && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>답변: {s.answerPreview}…</div>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 이미지 첨부 (문제 사진) — 최대 3장, 한 문항만 */}
          <label className="label" style={{ marginTop: 4 }}>문제 이미지 (최대 {MAX_IMG}장)</label>
          <p style={{ fontSize: 12, color: 'var(--chip-confirmed)', background: 'var(--chip-confirmed-bg,#FAF1E2)', borderRadius: 8, padding: '7px 10px', margin: '0 0 8px' }}>
            ⚠️ 한 번에 <b>한 문항만</b> 올려주세요. 여러 문항을 함께 올리면 답변이 정확하지 않을 수 있어요.
          </p>
          <SchoolRecordUploadNotice />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, marginTop: 8 }}>
            {atts.map((a) => (
              <div key={a.id} style={{ position: 'relative' }}>
                <AuthImage fileId={a.id} alt={a.name} size={84} />
                <button type="button" onClick={() => setAtts((p) => p.filter((x) => x.id !== a.id))} title="제거"
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--chip-danger)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0 }}>✕</button>
              </div>
            ))}
            {atts.length < MAX_IMG && (
              <button type="button" onClick={() => fileRef.current?.click()} style={{ width: 84, height: 84, borderRadius: 8, border: '1px dashed var(--input-border)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
                ＋ 사진<br />추가
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
          </div>

          <Button onClick={submit} disabled={!f.body.trim()}>질문 등록</Button>
        </Card>
      )}

      {posts === null ? <Spinner /> : posts.length === 0 ? <Card><EmptyState>등록한 질문이 없어요.</EmptyState></Card> : (
        posts.map((p) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge kind="soft">{p.subject ?? '질문'}</Badge>
                <Badge kind="soft">{p.scope === 'open' ? '공개' : '지정'}</Badge>
                {p.difficulty && <Badge kind="soft">난이도 {p.difficulty}</Badge>}
                <Badge kind={p.status === 'resolved' ? 'done' : p.status === 'ai_pending' ? 'soft' : (p.answers?.length ?? 0) > 0 ? 'confirmed' : 'new'}>
                  {p.status === 'resolved' ? '채택완료'
                    : p.status === 'ai_pending' ? '✦ AI 즉답'
                    : (p.answers?.length ?? 0) > 0 ? '답변옴'
                    : (p.claimedAt || p.assignedTeacherId) ? '👀 선생님 확인 중'
                    : '답변대기'}
                </Badge>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }} title="질문 등록 시각">등록 {T(p.created_at)}{p.firstReplyAt ? ` · 첫 답변 ${T(p.firstReplyAt)}` : p.claimedAt ? ` · 확인 시작 ${T(p.claimedAt)}` : ''}</span>
            </div>
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '8px 0 10px' }}>{p.body}</p>
            {(p.attachments?.filter(isImage).length ?? 0) > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {p.attachments!.filter(isImage).map((a) => <AuthImage key={a.id} fileId={a.id} alt={a.name} size={92} />)}
              </div>
            )}
            {(p.aiDraft || p.status === 'ai_pending') && (
              <div style={{ background: 'var(--teal-50,#EEF4FB)', border: '1px solid var(--input-border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--teal)', marginBottom: 4 }}>✦ AI 풀이 <span style={{ fontWeight: 500, color: 'var(--muted)' }}>· 참고용 무료 즉답</span></div>
                {p.aiDraft
                  ? <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{p.aiDraft}</div>
                  : <div style={{ fontSize: 13, color: 'var(--muted)' }}>AI 풀이를 만드는 중이에요… 잠시 후 새로고침해 주세요.</div>}
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>AI가 생성한 풀이입니다 — 심리·건강 관련은 전문가 상담을 권합니다.</div>
                {/* P2 퍼널: 충분하면 무료 종료, 부족하면 이 시점에 무료질문권/크레딧으로 사람 답변 */}
                {p.status === 'ai_pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button size="sm" onClick={() => requestTeacher(p.id)}>👩‍🏫 선생님 답변 받기{fee?.freeQuota && fee.freeQuota.remaining > 0 ? ` (무료 ${fee.freeQuota.remaining}건 남음)` : (fee?.ticketRemaining ?? 0) > 0 ? ` (질문권 ${fee!.ticketRemaining}건 보유)` : fee ? ` (${(p.qType === 'item' ? fee.itemFee : fee.generalFee).toLocaleString()} 크레딧)` : ''}</Button>
                    <button type="button" onClick={() => resolveAi(p.id)}
                      style={{ fontSize: 12.5, border: '1px solid var(--input-border)', background: 'var(--surface)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'var(--muted)' }}>
                      충분해요 — 해결로 표시
                    </button>
                  </div>
                )}
              </div>
            )}
            {(p.answers?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {p.answers!.map((a) => (
                  <div key={a.id} style={{ background: 'var(--fill,#f4f7fb)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 13 }}>{a.teacherName} 선생님 답변 <span style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--caption)' }}>{T(a.createdAt)}</span> {a.accepted && <Badge kind="done">채택</Badge>}</b>
                      {!a.accepted && p.status !== 'resolved' && <Button size="sm" onClick={() => accept(a.id)}>채택</Button>}
                    </div>
                    <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginTop: 4 }}>{a.body}</div>
                    {(a.attachments ?? []).length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                        {(a.attachments ?? []).map((f) => <AuthImage key={f.id} fileId={f.id} alt={f.name} size={160} />)}
                      </div>
                    )}
                    {/* C2 후속 문답 스레드 — 같은 선생님에게 이어 묻기(답변당 한도, 무료) */}
                    {(a.followups ?? []).map((fu) => (
                      <div key={fu.id} style={{ marginTop: 6, marginLeft: 12, padding: '6px 10px', borderLeft: '3px solid var(--line)', fontSize: 13 }}>
                        <b style={{ fontSize: 12, color: fu.byTeacher ? 'var(--teal)' : 'var(--muted)' }}>{fu.byTeacher ? '선생님' : '나'}</b>
                        <div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{fu.body}</div>
                      </div>
                    ))}
                    {p.status !== 'resolved' && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, marginLeft: 12 }}>
                        <input value={fuDraft[a.id] ?? ''} onChange={(e) => setFuDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendFollowup(a.id); }}
                          placeholder="이 답변에 이어서 궁금한 점 묻기 (무료)"
                          style={{ flex: 1, border: '1px solid var(--input-border)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
                        <Button size="sm" disabled={!(fuDraft[a.id] ?? '').trim()} onClick={() => sendFollowup(a.id)}>보내기</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* 답변 후속: 미채택이면 재답변+승격, 채택 후에도 상담 승격은 가능(같은 선생님과 이어가기) */}
            {(p.answers?.length ?? 0) > 0 && (p.status === 'open' || p.status === 'resolved') && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {p.status === 'open' && (
                  <button type="button" onClick={() => reanswer(p.id)} style={{ fontSize: 12.5, border: '1px solid var(--input-border)', background: 'var(--surface)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'var(--muted)' }}>🔁 다른 답변 받기</button>
                )}
                {((p.answers!.find((a) => a.accepted) ?? p.answers![p.answers!.length - 1])?.escalationOk !== false) && (
                  <button type="button" onClick={() => escalate(p.id)} style={{ fontSize: 12.5, border: '1px solid var(--teal)', background: 'var(--teal-50,#EEF4FB)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700 }}>💬 상담으로 이어가기</button>
                )}
              </div>
            )}
            {/* 상담 이어가기 — 가까운 후보 시간대 선택 */}
            {escCand?.postId === p.id && (
              <div style={{ marginTop: 8, border: '1px solid var(--teal)', background: 'var(--teal-50,#EEF4FB)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--teal)', marginBottom: 6 }}>
                  📅 가까운 상담 가능 시간{escCand.minutes ? ` (${escCand.minutes}분)` : ''} — 골라주시면 바로 예약돼요
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {escCand.items.map((c) => (
                    <button key={`${c.dateStr}-${c.slotStart}`} type="button" onClick={() => escalate(p.id, { dateStr: c.dateStr, slotStart: c.slotStart })}
                      style={{ fontSize: 12.5, fontWeight: 700, border: '1px solid var(--teal)', background: 'var(--surface)', borderRadius: 999, padding: '6px 14px', cursor: 'pointer', color: 'var(--teal)' }}>
                      {c.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setEscCand(null)} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)' }}>취소</button>
                </div>
              </div>
            )}
            {/* Q1 해결 피드백 */}
            {p.status === 'resolved' && p.rating == null && <FeedbackPanel onSubmit={(r, c) => sendFeedback(p.id, r, c)} />}
            {p.status === 'resolved' && p.rating != null && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                평가함 {'★'.repeat(p.rating)}{p.continuePref === false ? ' · 이 선생님 비노출' : ''}
              </div>
            )}
          </Card>
        ))
      )}

      {blocks.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>그만 받기로 한 선생님</div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>이 선생님에게는 내 질문이 노출·배정되지 않습니다(선생님에게는 알리지 않음).</p>
          {blocks.map((b) => (
            <div key={b.teacherId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--fill,#eef2f7)' }}>
              <span style={{ fontSize: 13.5 }}>{b.teacherName} 선생님</span>
              <button type="button" onClick={() => unblock(b.teacherId)} style={{ fontSize: 12.5, border: '1px solid var(--input-border)', background: 'var(--surface)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', color: 'var(--teal)' }}>다시 받기</button>
            </div>
          ))}
        </Card>
      )}

      {/* P3 — 유사 질문 익명 열람 모달 */}
      {simView && (
        <div onClick={() => setSimView(null)} style={{ position: 'fixed', inset: 0, zIndex: 960, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <b style={{ fontSize: 15 }}>💡 비슷한 질문의 답변 (무료 열람)</b>
              <button onClick={() => setSimView(null)} aria-label="닫기" style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ background: 'var(--fill,#f4f7fb)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>{simView.subject ? `[${simView.subject}] ` : ''}질문 (익명)</div>
              <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{simView.body}</div>
            </div>
            {simView.answers.map((a, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <b style={{ fontSize: 12.5 }}>{a.teacherName} 선생님 {a.accepted && <Badge kind="done">채택</Badge>}</b>
                <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', marginTop: 4 }}>{a.body}</div>
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>이 답변으로 부족하면 작성 중인 질문을 그대로 등록하세요 — AI 풀이가 먼저 무료로 제공됩니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}
