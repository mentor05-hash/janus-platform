import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, TextareaField, SelectField } from '../components/ui';
import { AuthImage } from '../components/AuthImage';

type Attachment = { id: string; name: string; type?: string };
type Answer = { id: string; body: string; accepted: boolean; teacherName: string; teacherId?: string | null; attachments?: Attachment[] };
type Post = {
  id: string;
  subject: string | null;
  difficulty: string | null;
  scope: string;
  body: string;
  status: string;
  q_type?: string | null;
  created_at: string;
  rating?: number | null;
  continuePref?: boolean | null;
  aiDraft?: string | null;
  attachments?: Attachment[];
  answers?: Answer[];
};
type Block = { teacherId: string; teacherName: string; since: string };
type TeacherDir = { teacherId: string; name: string; avgFirstReplyMin: number | null; avgRating: number | null; answers: number; accepted: number };
const isImage = (a: Attachment) => (a.type ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.name);
const MAX_IMG = 3;

const SUBJECTS = ['국어', '수학', '영어', '탐구'];

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
  const [fee, setFee] = useState<{ itemFee: number; generalFee: number; freeQuota?: { quota: number; used: number; remaining: number; resetsAt: string } | null } | null>(null);
  useEffect(() => {
    api.get<Record<string, number>>('/bookings/question-duration/policy').then(setDurPol).catch(() => { /* 기본값 */ });
    api.get<{ itemFee: number; generalFee: number; freeQuota?: { quota: number; used: number; remaining: number; resetsAt: string } | null }>('/qna/pricing').then(setFee).catch(() => { /* 요금 조회 실패 */ });
    api.get<{ teachers: TeacherDir[] }>('/qna/teachers').then((r) => setTeachers(r.teachers ?? [])).catch(() => { /* 디렉터리 조회 실패 */ });
  }, []);
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
      load(); loadBlocks();
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
  // 상담으로 이어가기 — 답변 선생님과 상담 예약 생성(컨텍스트 이관).
  async function escalate(postId: string) {
    setError(''); setMsg('');
    try {
      const r = await api.post<{ bookingId?: string; message?: string }>(`/qna/posts/${postId}/escalate`, {});
      setMsg(r.bookingId ? '상담 예약이 생성됐어요. 예약 화면에서 확인하세요.' : (r.message ?? '상담 예약을 생성하지 못했어요.'));
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '상담 승격 실패'); }
  }

  async function submit() {
    setError(''); setMsg('');
    if (!f.body.trim()) { setError('질문 내용을 입력하세요.'); return; }
    if (f.scope === 'assigned' && !assignedTeacherId) { setError('지정 질문은 선생님을 선택해야 합니다.'); return; }
    try {
      const r = await api.post<{ freeUsed?: boolean; freeRemaining?: number; chargedCredits?: number }>('/qna/posts', { subject: f.subject, qType: f.qType, scope: f.scope, difficulty: f.difficulty, body: f.body, attachments: atts, ...(f.scope === 'assigned' ? { assignedTeacherId } : {}) });
      setMsg(r.freeUsed
        ? `질문이 등록되었습니다 — 무료 질문권 사용(이번 주 ${r.freeRemaining ?? 0}건 남음).`
        : `질문이 등록되었습니다(${(r.chargedCredits ?? 0).toLocaleString()} 크레딧 차감).`);
      setF({ ...f, body: '' }); setAtts([]); setOpen(false); load();
      api.get<{ itemFee: number; generalFee: number; freeQuota?: { quota: number; used: number; remaining: number; resetsAt: string } | null }>('/qna/pricing').then(setFee).catch(() => { /* noop */ });
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 402 ? '크레딧이 부족합니다.' : e.message) : '등록 실패');
    }
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
          {f.scope === 'assigned' && (
            <div style={{ marginTop: 8 }}>
              <label className="label">지정할 선생님 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— 평균 첫응답·만족도는 지정 질문 실적 기준</span></label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 8 }}>
                {teachers.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>선택 가능한 선생님이 없습니다.</span>}
                {teachers.map((t) => (
                  <button key={t.teacherId} type="button" onClick={() => setAssignedTeacherId(t.teacherId)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: assignedTeacherId === t.teacherId ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t.name} 선생님</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {t.avgFirstReplyMin != null ? `⚡ 평균 첫응답 ${t.avgFirstReplyMin >= 60 ? `${Math.round(t.avgFirstReplyMin / 60)}시간` : `${t.avgFirstReplyMin}분`}` : '신규'}
                      {t.avgRating != null && ` · ★${t.avgRating}`}
                      {t.answers > 0 && ` · 답변 ${t.answers}건`}
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
              {' · '}난이도가 높을수록 답변블록이 길어져요.
            </span>
          </div>
          <TextareaField label="질문 내용" rows={4} value={f.body} onChange={(e) => set('body', e.target.value)} placeholder="예: 미적분 30번, 합성함수 미분에서 왜 이렇게 전개되나요?" />

          {/* 이미지 첨부 (문제 사진) — 최대 3장, 한 문항만 */}
          <label className="label" style={{ marginTop: 4 }}>문제 이미지 (최대 {MAX_IMG}장)</label>
          <p style={{ fontSize: 12, color: 'var(--chip-confirmed)', background: 'var(--chip-confirmed-bg,#FAF1E2)', borderRadius: 8, padding: '7px 10px', margin: '0 0 8px' }}>
            ⚠️ 한 번에 <b>한 문항만</b> 올려주세요. 여러 문항을 함께 올리면 답변이 정확하지 않을 수 있어요.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
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
                <Badge kind={p.status === 'resolved' ? 'done' : (p.answers?.length ?? 0) > 0 ? 'confirmed' : 'new'}>{p.status === 'resolved' ? '채택완료' : (p.answers?.length ?? 0) > 0 ? '답변옴' : '답변대기'}</Badge>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(p.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
            </div>
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '8px 0 10px' }}>{p.body}</p>
            {(p.attachments?.filter(isImage).length ?? 0) > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {p.attachments!.filter(isImage).map((a) => <AuthImage key={a.id} fileId={a.id} alt={a.name} size={92} />)}
              </div>
            )}
            {p.aiDraft && (
              <div style={{ background: 'var(--teal-50,#EEF4FB)', border: '1px solid var(--input-border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--teal)', marginBottom: 4 }}>✦ AI 초안 <span style={{ fontWeight: 500, color: 'var(--muted)' }}>· 참고용, 선생님 검토 후 확정</span></div>
                <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{p.aiDraft}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>AI가 생성한 초안입니다 — 심리·건강 관련은 전문가 상담을 권합니다.</div>
              </div>
            )}
            {(p.answers?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {p.answers!.map((a) => (
                  <div key={a.id} style={{ background: 'var(--fill,#f4f7fb)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 13 }}>{a.teacherName} 선생님 답변 {a.accepted && <Badge kind="done">채택</Badge>}</b>
                      {!a.accepted && p.status !== 'resolved' && <Button size="sm" onClick={() => accept(a.id)}>채택</Button>}
                    </div>
                    <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginTop: 4 }}>{a.body}</div>
                    {(a.attachments ?? []).length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                        {(a.attachments ?? []).map((f) => <AuthImage key={f.id} fileId={f.id} alt={f.name} size={160} />)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* 불만족 후속: 답변이 있는데 아직 미채택이면 재답변·상담승격 */}
            {(p.answers?.length ?? 0) > 0 && p.status === 'open' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => reanswer(p.id)} style={{ fontSize: 12.5, border: '1px solid var(--input-border)', background: 'var(--surface)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'var(--muted)' }}>🔁 다른 답변 받기</button>
                <button type="button" onClick={() => escalate(p.id)} style={{ fontSize: 12.5, border: '1px solid var(--teal)', background: 'var(--teal-50,#EEF4FB)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700 }}>💬 상담으로 이어가기</button>
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
    </div>
  );
}
