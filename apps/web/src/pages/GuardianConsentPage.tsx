import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';

/*
 * 본부 결정 ① 학부모 동의·본인확인 — 미성년 자녀 정보 전달 게이트.
 * 흐름: 자녀 선택 → 본인확인(성인 실명확인·현재 데모 어댑터) → 데이터 전달 동의 → (필요 시)철회.
 * 동의가 있어도 플랫폼이 개인정보를 외부로 직접 발송하지는 않으며(현행 계정 내 열람·학생 주도 공유),
 * 직접 통지 채널은 본부 확정·연동 후에만 켜집니다.
 */
type Child = { studentId: string; name: string };
type Status = {
  studentId: string;
  isMinor: boolean;
  verifyStatus: 'unverified' | 'verified' | 'failed';
  verifiedName: string | null;
  verifiedAt: string | null;
  consentDelivery: boolean;
  consentAt: string | null;
  revokedAt: string | null;
  policyVersion: string;
};

const D = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** 내 연결 신청 목록 — 승인 전에는 자녀가 안 보이므로 상태를 알 방법이 필요하다. */
type GLink = { id: string; status: string; relation: string | null; counterpartName: string };
const LINK_STATUS: Record<string, string> = {
  pending: '자녀 승인 대기 중', approved: '연결됨', rejected: '자녀가 거절함', revoked: '연결 해제됨',
};

export function GuardianConsentPage() {
  const [links, setLinks] = useState<GLink[] | null>(null);
  const [linkForm, setLinkForm] = useState({ studentLoginId: '', relation: '모' });
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const loadLinks = () => api.get<GLink[]>('/guardian/links').then((r) => setLinks(Array.isArray(r) ? r : [])).catch(() => setLinks([]));

  async function requestLink() {
    const id = linkForm.studentLoginId.trim();
    if (!id) { setLinkErr('자녀 아이디를 입력하세요.'); return; }
    setLinkBusy(true); setLinkMsg(''); setLinkErr('');
    try {
      await api.post('/guardian/links', { studentLoginId: id, relation: linkForm.relation || undefined });
      setLinkMsg('연결을 신청했어요. 자녀가 승인하면 자녀 화면이 열립니다.');
      setLinkForm({ ...linkForm, studentLoginId: '' });
      await loadLinks();
    } catch (e) {
      setLinkErr(e instanceof ApiError ? e.message : '연결 신청 실패');
    } finally { setLinkBusy(false); }
  }

  const [children, setChildren] = useState<Child[] | null>(null);
  const [sel, setSel] = useState('');
  const [st, setSt] = useState<Status | null>(null);
  const [form, setForm] = useState({ name: '', birth: '', phone: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const setF = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get<Child[]>('/guardian/children').then((cs) => { setChildren(cs); if (cs[0]) setSel(cs[0].studentId); }).catch(() => setChildren([]));
    void loadLinks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStatus = useCallback(async (studentId: string) => {
    setMsg(''); setErr('');
    try { setSt(await api.get<Status>(`/guardian/consent?studentId=${encodeURIComponent(studentId)}`)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : '상태 조회 실패'); setSt(null); }
  }, []);
  useEffect(() => { if (sel) void loadStatus(sel); }, [sel, loadStatus]);

  async function verify() {
    if (!form.name.trim()) { setErr('이름을 입력하세요.'); return; }
    setBusy(true); setMsg(''); setErr('');
    try {
      await api.post('/guardian/consent/verify', { studentId: sel, name: form.name.trim(), method: 'phone', birth: form.birth || undefined, phone: form.phone || undefined });
      setMsg('본인확인이 완료되었습니다.');
      setForm({ name: '', birth: '', phone: '' });
      await loadStatus(sel);
    } catch (e) { setErr(e instanceof ApiError ? e.message : '본인확인 실패'); }
    finally { setBusy(false); }
  }

  async function grant() {
    if (!agree) { setErr('동의 항목에 체크해야 합니다.'); return; }
    setBusy(true); setMsg(''); setErr('');
    try {
      await api.post('/guardian/consent', { studentId: sel });
      setMsg('데이터 전달 동의가 등록되었습니다.');
      setAgree(false);
      await loadStatus(sel);
    } catch (e) { setErr(e instanceof ApiError ? e.message : '동의 등록 실패'); }
    finally { setBusy(false); }
  }

  async function revoke() {
    if (!window.confirm('전달 동의를 철회할까요? 철회 후에는 직접 통지 대상에서 제외됩니다.')) return;
    setBusy(true); setMsg(''); setErr('');
    try {
      await api.del(`/guardian/consent?studentId=${encodeURIComponent(sel)}`);
      setMsg('전달 동의가 철회되었습니다.');
      await loadStatus(sel);
    } catch (e) { setErr(e instanceof ApiError ? e.message : '철회 실패'); }
    finally { setBusy(false); }
  }

  const verified = st?.verifyStatus === 'verified';

  return (
    <div>
      <h1 className="page-title">동의 · 본인확인</h1>
      <p className="page-sub">자녀 정보를 학부모께 전달하기 위한 <b>성인 본인확인</b>과 <b>전달 동의</b> 절차입니다. 미성년 자녀 보호를 위해 반드시 필요합니다.</p>

      {/* 자녀 연결 — **모든 학부모 기능의 선결조건**. 이전에는 '승인받아 주세요'라고만 적혀 있고
          신청할 화면이 웹·모바일 어디에도 없어(API 는 있었다) 학부모 메뉴 전량이 빈 화면이었다. */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>자녀 연결</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>
          자녀의 아이디로 연결을 신청하면 자녀가 승인합니다. <b>연결은 '열람 허용'이 아니에요</b> —
          무엇을 볼 수 있는지는 자녀의 연령과 아래 본인확인·동의(또는 성인 자녀의 공유 동의)로 정해집니다.
        </p>
        {linkErr ? <p style={{ color: 'var(--danger, #E5484D)', fontSize: 13 }}>{linkErr}</p> : null}
        {linkMsg ? <p style={{ color: 'var(--teal, #2A8A5F)', fontSize: 13 }}>{linkMsg}</p> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={linkForm.studentLoginId}
            onChange={(e) => setLinkForm({ ...linkForm, studentLoginId: e.target.value })}
            placeholder="자녀 아이디"
            style={{ flex: '1 1 180px', minWidth: 140, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}
          />
          <select
            value={linkForm.relation}
            onChange={(e) => setLinkForm({ ...linkForm, relation: e.target.value })}
            style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}
          >
            {['모', '부', '기타'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn" onClick={requestLink} disabled={linkBusy}>연결 신청</button>
        </div>
        {links && links.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
            {links.map((l) => (
              <div key={l.id} style={{ paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', gap: 10, fontSize: 13.5 }}>
                  <b style={{ flex: 1 }}>{l.counterpartName}{l.relation ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {l.relation}</span> : null}</b>
                  <span style={{ color: 'var(--muted)' }}>{LINK_STATUS[l.status] ?? l.status}</span>
                </div>
                {/* 막다른 길로 보이지 않게 다음 행동을 알려준다 — 거절·해제는 끝이 아니라 대기다(O124).
                    숫자는 API 의 RELINK_COOLDOWN_DAYS·RELINK_MAX_ATTEMPTS 와 짝. */}
                {(l.status === 'rejected' || l.status === 'revoked') && (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                    7일 뒤 같은 아이디로 다시 신청할 수 있어요(최대 3회). 더 빨리 연결하려면 센터 관리자에게 문의해 주세요.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {children && children.length > 0 && (
        <>
          {children.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <select className="input" value={sel} onChange={(e) => setSel(e.target.value)} style={{ maxWidth: 220 }}>
                {children.map((c) => <option key={c.studentId} value={c.studentId}>{c.name}</option>)}
              </select>
            </div>
          )}

          {msg && <p style={{ color: 'var(--chip-done,#1f7a52)', fontSize: 13 }}>{msg}</p>}
          {err && <p style={{ color: 'var(--danger,#c0392b)', fontSize: 13 }}>{err}</p>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
            {/* 1) 본인확인 */}
            <div className="card" style={{ padding: 18 }}>
              <h3 style={{ margin: '0 0 4px' }}>1. 본인확인</h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0 }}>
                상태:{' '}
                {verified
                  ? <b style={{ color: 'var(--chip-done,#1f7a52)' }}>확인 완료 ({st?.verifiedName}) · {D(st?.verifiedAt ?? null)}</b>
                  : st?.verifyStatus === 'failed' ? <b style={{ color: 'var(--danger,#c0392b)' }}>실패 — 다시 시도</b>
                  : <b>미완료</b>}
              </p>
              {!verified && (
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  <input className="input" placeholder="보호자 성함" value={form.name} onChange={(e) => setF('name', e.target.value)} />
                  <input className="input" placeholder="생년월일 8자리(선택)" value={form.birth} onChange={(e) => setF('birth', e.target.value)} />
                  <input className="input" placeholder="휴대폰 번호" value={form.phone} onChange={(e) => setF('phone', e.target.value)} />
                  <button className="btn" onClick={() => void verify()} disabled={busy}>본인확인</button>
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
                    입력하신 휴대폰·생년월일은 확인 용도로만 쓰이며 <b>원본은 저장하지 않습니다</b>(마스킹 참조만 보관). 실 인증 연동(PASS/휴대폰 인증) 전 데모 확인 단계입니다.
                  </p>
                </div>
              )}
            </div>

            {/* 2) 전달 동의 */}
            <div className="card" style={{ padding: 18 }}>
              <h3 style={{ margin: '0 0 4px' }}>2. 데이터 전달 동의</h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0 }}>
                상태:{' '}
                {st?.consentDelivery
                  ? <b style={{ color: 'var(--chip-done,#1f7a52)' }}>동의됨 · {D(st?.consentAt ?? null)} (약관 {st?.policyVersion})</b>
                  : <b>미동의</b>}
              </p>
              {!verified ? (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>본인확인을 먼저 완료해 주세요.</p>
              ) : st?.consentDelivery ? (
                <button className="btn btn-ghost" onClick={() => void revoke()} disabled={busy} style={{ marginTop: 6 }}>동의 철회</button>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
                    <span>
                      자녀의 상담 리포트 등 학습 정보를 <b>보호자(본인)에게 전달</b>받는 것에 동의합니다. 동의는 언제든 철회할 수 있으며, 철회 시 이후 직접 통지가 중단됩니다.
                    </span>
                  </label>
                  <button className="btn" onClick={() => void grant()} disabled={busy || !agree} style={{ marginTop: 10 }}>동의하기</button>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 14, marginTop: 16, background: 'var(--fill,#f4f7fb)' }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              ℹ️ 동의하셔도 플랫폼이 개인정보를 외부로 자동 발송하지 않습니다. 현재 전달은 <b>학부모 계정 내 열람</b>과 <b>자녀가 직접 공유</b>한 리포트로 이뤄지며,
              직접 통지(알림톡·이메일) 채널은 본부 정책 확정과 연동 이후에만 활성화됩니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
