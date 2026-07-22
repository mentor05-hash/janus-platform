import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';

/* 학원 관리(운영자) — 내 클레임 + 리드 인박스 왕복(스펙 §7-4 일부·§8 세션5). */
type Claim = { id: string; status: string; reviewNote: string | null; createdAt: string; academy: { id: string; name: string; isOwner: boolean } };
type Lead = { id: string; status: string; message: string | null; shared: { name?: string; grade?: string; goalTier?: string; contact?: string }; consentScope: string[]; reply: { text: string; at: string } | null; ts: string };

const STATUS_KO: Record<string, string> = { sent: '신규', read: '열람', replied: '응답함', closed: '종료' };
const D = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AcademyManagePage() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [sel, setSel] = useState<string>('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get<Claim[]>('/claims/mine').then((cs) => { setClaims(cs); const owned = cs.find((c) => c.academy.isOwner); if (owned) setSel(owned.academy.id); }).catch(() => setClaims([]));
  }, []);

  const loadLeads = useCallback(async (academyId: string) => {
    setMsg('');
    try { setLeads(await api.get<Lead[]>(`/claims/${academyId}/leads`)); } catch (e) { setMsg(e instanceof ApiError ? e.message : '리드 조회 실패'); setLeads([]); }
  }, []);
  useEffect(() => { if (sel) void loadLeads(sel); }, [sel, loadLeads]);

  async function reply(leadId: string, status: 'read' | 'replied' | 'closed') {
    try {
      await api.patch(`/claims/${sel}/leads/${leadId}`, { status, reply: status === 'replied' ? replyText : undefined });
      setReplyFor(null); setReplyText(''); await loadLeads(sel);
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '처리 실패'); }
  }

  const owned = (claims ?? []).filter((c) => c.academy.isOwner);

  return (
    <div>
      <h1 className="page-title">학원 관리</h1>
      <p className="page-sub">승인된 학원의 상담 신청(리드)을 확인하고 응답하세요.</p>
      {msg && <p style={{ color: 'var(--teal,#1f6feb)', fontSize: 13 }}>{msg}</p>}

      {claims === null ? <p style={{ color: 'var(--muted)' }}>불러오는 중…</p>
        : owned.length === 0 ? (
          <div className="card" style={{ padding: 18 }}>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>승인된 학원이 없습니다. 학원 클레임을 신청해 승인받으면 이곳에서 반·버스·상담 신청을 관리할 수 있어요.</p>
            {(claims ?? []).filter((c) => !c.academy.isOwner).map((c) => (
              <div key={c.id} style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>· {c.academy.name} — 심사 {c.status}</div>
            ))}
          </div>
        ) : (
          <>
            {owned.length > 1 && (
              <select className="input" value={sel} onChange={(e) => setSel(e.target.value)} style={{ maxWidth: 260, marginBottom: 12 }}>
                {owned.map((c) => <option key={c.academy.id} value={c.academy.id}>{c.academy.name}</option>)}
              </select>
            )}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', fontWeight: 700 }}>상담 신청 인박스</div>
              {leads.length === 0 ? <p style={{ padding: 14, color: 'var(--muted)', fontSize: 13 }}>아직 신청이 없어요.</p> : leads.map((l) => (
                <div key={l.id} style={{ borderTop: '1px solid var(--line)', padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 7px', background: l.status === 'sent' ? '#fdecec' : 'var(--fill,#f4f7fb)', color: l.status === 'sent' ? '#c0392b' : 'var(--muted)' }}>{STATUS_KO[l.status] ?? l.status}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{D(l.ts)}</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>
                    {l.shared.name && <b>{l.shared.name}</b>}{l.shared.grade ? ` · ${l.shared.grade}` : ''}{l.shared.goalTier ? ` · 목표 ${l.shared.goalTier}` : ''}{l.shared.contact ? ` · ☎ ${l.shared.contact}` : ''}
                  </div>
                  {l.message && <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 4 }}>{l.message}</div>}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>동의 공유 항목: {l.consentScope.join(', ') || '없음'}</div>
                  {l.reply && <div style={{ fontSize: 12, color: 'var(--teal,#1f6feb)', marginTop: 6 }}>내 응답: {l.reply.text}</div>}

                  {replyFor === l.id ? (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <input className="input" placeholder="응답 메시지" value={replyText} onChange={(e) => setReplyText(e.target.value)} style={{ flex: 1 }} />
                      <button className="btn" onClick={() => reply(l.id, 'replied')}>전송</button>
                      <button className="btn btn-ghost" onClick={() => setReplyFor(null)}>취소</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      {l.status === 'sent' && <button className="btn btn-ghost" onClick={() => reply(l.id, 'read')}>열람 표시</button>}
                      <button className="btn btn-ghost" onClick={() => { setReplyFor(l.id); setReplyText(l.reply?.text ?? ''); }}>응답</button>
                      {l.status !== 'closed' && <button className="btn btn-ghost" onClick={() => reply(l.id, 'closed')}>종료</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
    </div>
  );
}
