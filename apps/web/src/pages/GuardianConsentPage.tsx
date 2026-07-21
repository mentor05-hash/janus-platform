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

export function GuardianConsentPage() {
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
  }, []);

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

      {children && children.length === 0 && (
        <div className="card" style={{ padding: 18 }}>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>연결된 자녀가 없습니다. 먼저 자녀 계정 연결을 승인받아 주세요.</p>
        </div>
      )}

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
