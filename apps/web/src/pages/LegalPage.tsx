import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, Card, Button, Badge, ErrorText } from '../components/ui';

type Consent = {
  agreed: boolean;
  current: { termsVersion: string; privacyVersion: string; marketingAgreed: boolean; isMinor: boolean; guardianName: string | null; agreedAt: string } | null;
  needsRenewal: boolean;
  latest: { termsVersion: string; privacyVersion: string };
};

/** 약관·개인정보 — 동의 현황·재동의, 데이터 내보내기, 회원 탈퇴(인증). */
export function LegalPage() {
  const { logout } = useAuth();
  const [consent, setConsent] = useState<Consent | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [minor, setMinor] = useState(false);
  const [gName, setGName] = useState('');
  const [gContact, setGContact] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reason, setReason] = useState('');

  // 연락처 인증
  const [contact, setContact] = useState<{ email: string | null; phone: string | null; email_verified: boolean; phone_verified: boolean } | null>(null);
  const [vTarget, setVTarget] = useState('');
  const [vChannel, setVChannel] = useState<'email' | 'phone'>('email');
  const [vCode, setVCode] = useState('');
  const [vSent, setVSent] = useState(false);

  // 푸시 토큰
  const [pushCount, setPushCount] = useState<number | null>(null);

  const load = () => {
    api.get<Consent>('/legal/consent').then(setConsent).catch(() => {});
    api.get<typeof contact>('/me/contact').then(setContact).catch(() => {});
  };
  useEffect(() => { void load(); }, []);

  // 이 브라우저를 푸시 기기로 등록(데모 토큰) + 기기 수 로드
  useEffect(() => {
    (async () => {
      try {
        const KEY = 'mp_push_token';
        let token = localStorage.getItem(KEY);
        if (!token) { token = `ExponentPushToken[web-${Math.random().toString(36).slice(2, 10)}]`; localStorage.setItem(KEY, token); }
        await api.post('/me/push-token', { token, platform: 'web' });
      } catch { /* noop */ }
      try { const r = await api.get<{ count: number }>('/me/push-token'); setPushCount(r.count); } catch { /* noop */ }
    })();
  }, []);

  async function testPush() {
    setError(''); setMsg('');
    try { const r = await api.post<{ message: string }>('/me/push-token/test', {}); setMsg(r.message); }
    catch (e) { setError(e instanceof ApiError ? e.message : '발송 실패'); }
  }

  async function verifyRequest() {
    setError(''); setMsg('');
    try {
      const r = await api.post<{ message: string; devCode?: string }>('/me/verify/request', { channel: vChannel, target: vTarget });
      setVSent(true);
      setMsg(r.devCode ? `${r.message} (데모 코드: ${r.devCode})` : r.message);
      if (r.devCode) setVCode(r.devCode);
    } catch (e) { setError(e instanceof ApiError ? e.message : '요청 실패'); }
  }
  async function verifyConfirm() {
    setError(''); setMsg('');
    try {
      const r = await api.post<{ message: string }>('/me/verify/confirm', { channel: vChannel, code: vCode });
      setMsg(r.message); setVSent(false); setVCode(''); setVTarget('');
      api.get<typeof contact>('/me/contact').then(setContact).catch(() => {});
    } catch (e) { setError(e instanceof ApiError ? e.message : '인증 실패'); }
  }

  async function saveConsent() {
    setError(''); setMsg('');
    try {
      await api.post('/legal/consent', { termsAgreed: terms, privacyAgreed: privacy, marketingAgreed: marketing, isMinor: minor, guardianName: gName, guardianContact: gContact });
      setMsg('동의가 저장되었습니다.'); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '저장 실패'); }
  }
  async function exportData() {
    try { await api.downloadPath('/me/data-export', 'mydata.json'); }
    catch (e) { setError(e instanceof ApiError ? e.message : '내보내기 실패'); }
  }
  async function withdraw() {
    setError('');
    try {
      await api.post('/me/withdraw', { reason: reason || undefined });
      alert('회원 탈퇴가 완료되었습니다. 개인정보는 비식별 처리되었습니다.');
      logout();
    } catch (e) { setError(e instanceof ApiError ? e.message : '탈퇴 실패'); }
  }

  return (
    <div>
      <PageHeader title="약관·개인정보" sub="동의 현황·데이터 내보내기·회원 탈퇴" />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      <ErrorText>{error}</ErrorText>

      <div style={{ display: 'grid', gap: 12 }}>
        {/* 약관·방침 */}
        <Card>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>약관·방침</h3>
          <div style={{ display: 'flex', gap: 14 }}>
            <Link to="/terms" style={{ fontSize: 14, color: 'var(--teal)' }}>이용약관 보기 →</Link>
            <Link to="/privacy" style={{ fontSize: 14, color: 'var(--teal)' }}>개인정보처리방침 보기 →</Link>
          </div>
        </Card>

        {/* 동의 현황 */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>동의 현황</h3>
            {consent && (consent.needsRenewal
              ? <Badge kind="danger">동의 필요</Badge>
              : <Badge kind="done">동의 완료</Badge>)}
          </div>
          {consent?.current && !consent.needsRenewal ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              약관 v{consent.current.termsVersion} · 개인정보 v{consent.current.privacyVersion}
              {consent.current.marketingAgreed ? ' · 마케팅 수신 동의' : ''}
              {consent.current.isMinor ? ` · 미성년(보호자 ${consent.current.guardianName})` : ''}
              {' · '}{new Date(consent.current.agreedAt).toLocaleDateString('ko-KR')} 동의
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> <b>[필수]</b> 이용약관에 동의합니다.
              </label>
              <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} /> <b>[필수]</b> 개인정보 수집·이용에 동의합니다.
              </label>
              <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)' }}>
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /> [선택] 마케팅 정보 수신에 동의합니다.
              </label>
              <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)' }}>
                <input type="checkbox" checked={minor} onChange={(e) => setMinor(e.target.checked)} /> 만 14세 미만(미성년) — 보호자 동의 필요
              </label>
              {minor && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 24 }}>
                  <input className="input" style={{ maxWidth: 200 }} placeholder="보호자 성명" value={gName} onChange={(e) => setGName(e.target.value)} />
                  <input className="input" style={{ maxWidth: 220 }} placeholder="보호자 연락처" value={gContact} onChange={(e) => setGContact(e.target.value)} />
                </div>
              )}
              <div><Button onClick={saveConsent} disabled={!terms || !privacy}>동의 저장</Button></div>
            </div>
          )}
        </Card>

        {/* 연락처 인증 */}
        <Card>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>연락처 인증</h3>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 13, flexWrap: 'wrap' }}>
            <span>이메일: {contact?.email ?? '미등록'} {contact?.email_verified && <Badge kind="done">인증됨</Badge>}</span>
            <span>휴대폰: {contact?.phone ?? '미등록'} {contact?.phone_verified && <Badge kind="done">인증됨</Badge>}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="input" style={{ width: 110 }} value={vChannel} onChange={(e) => { setVChannel(e.target.value as 'email' | 'phone'); setVSent(false); }}>
              <option value="email">이메일</option>
              <option value="phone">휴대폰</option>
            </select>
            <input className="input" style={{ maxWidth: 220 }} placeholder={vChannel === 'email' ? '이메일 주소' : '휴대폰 번호'} value={vTarget} onChange={(e) => setVTarget(e.target.value)} />
            <Button variant="ghost" onClick={verifyRequest} disabled={!vTarget.trim()}>인증코드 발송</Button>
          </div>
          {vSent && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <input className="input" style={{ maxWidth: 140 }} placeholder="인증코드 6자리" value={vCode} onChange={(e) => setVCode(e.target.value)} />
              <Button onClick={verifyConfirm} disabled={!vCode.trim()}>인증 확인</Button>
            </div>
          )}
        </Card>

        {/* 푸시 알림 */}
        <Card>
          <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>푸시 알림</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
            이 기기가 푸시 알림 기기로 등록되었습니다{pushCount !== null ? ` (등록 기기 ${pushCount}대)` : ''}. 실제 앱은 expo-notifications 로 발송됩니다.
          </p>
          <Button variant="ghost" onClick={testPush}>테스트 푸시 발송</Button>
        </Card>

        {/* 데이터 내보내기 */}
        <Card>
          <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>내 데이터 내보내기</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>보유 중인 내 정보(프로필·예약·크레딧·질문·후기)를 JSON으로 내려받습니다.</p>
          <Button variant="ghost" onClick={exportData}>JSON 내보내기</Button>
        </Card>

        {/* 회원 탈퇴 */}
        <Card>
          <h3 style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--chip-danger)' }}>회원 탈퇴</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>탈퇴 시 개인정보는 비식별 처리되고 로그인이 차단됩니다. 상담·정산 기록은 법령·통계 목적상 익명 상태로 보관될 수 있습니다.</p>
          {!withdrawOpen ? (
            <Button variant="danger" onClick={() => setWithdrawOpen(true)}>회원 탈퇴</Button>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
              <input className="input" placeholder="탈퇴 사유(선택)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="danger" onClick={withdraw}>탈퇴 확정</Button>
                <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>취소</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
