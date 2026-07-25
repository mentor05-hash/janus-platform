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
/** 보호자 공유 동의(O105) — 성인 학생은 이 동의가 없으면 보호자가 내 산출물을 볼 수 없다. */
type ShareConsents = {
  scope: string;
  isMinor: boolean;
  guardians: Array<{ guardianId: string; guardianName: string | null; relation: string | null; granted: boolean; grantedAt: string | null; revokedAt: string | null }>;
};

/**
 * 보호자 연결(승인 대기) — **공유 동의보다 앞선다**. 연결 행이 없으면 공유 동의 카드 자체가 뜨지 않으므로
 * (guardians 목록이 연결에서 나온다) 승인 UI 가 없으면 O105 게이트 전체가 도달 불가였다.
 */
const LINK_STATUS: Record<string, string> = {
  pending: '승인 대기 중', approved: '연결됨', rejected: '거절함', revoked: '연결 해제됨',
};

type GuardianLink = { id: string; status: string; relation: string | null; counterpartName: string; canRespond: boolean };

export function LegalPage() {
  const [links, setLinks] = useState<GuardianLink[] | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState('');
  const loadLinks = () => api.get<GuardianLink[]>('/me/guardian-links').then((r) => setLinks(Array.isArray(r) ? r : [])).catch(() => setLinks([]));

  async function respond(id: string, action: 'approve' | 'reject' | 'revoke') {
    setLinkBusy(true); setLinkErr('');
    try {
      await api.patch(`/guardian/links/${id}/respond`, { action });
      await loadLinks();
      await loadShare(); // 승인하면 공유 동의 대상(보호자)이 생긴다 — 같은 화면에서 이어서 설정하게 한다
    } catch (e) {
      setLinkErr(e instanceof ApiError ? e.message : '응답 실패');
    } finally { setLinkBusy(false); }
  }

  const [share, setShare] = useState<ShareConsents | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareErr, setShareErr] = useState('');
  const loadShare = () => api.get<ShareConsents>('/me/share-consents').then(setShare).catch(() => setShare(null));
  useEffect(() => { loadShare(); loadLinks(); }, []);

  async function toggleShare(guardianId: string, next: boolean) {
    setShareBusy(true); setShareErr('');
    try {
      if (next) await api.post('/me/share-consents', { guardianId });
      else await api.del(`/me/share-consents?guardianId=${encodeURIComponent(guardianId)}`);
      await loadShare();
    } catch (e) {
      setShareErr(e instanceof ApiError ? e.message : '동의 변경 실패');
    } finally { setShareBusy(false); }
  }

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

        {/* 보호자 연결 — 공유 동의의 **선결조건**이라 위에 둔다(연결 승인 → 그 다음 공유 동의). */}
        {links && links.length > 0 && (
          <Card>
            <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>보호자 연결</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
              보호자가 연결을 신청하면 여기에서 승인하거나 거절할 수 있어요. 승인해야 보호자 화면이 열리고,
              <b> 무엇을 보여줄지는 아래 공유 동의에서 따로 정합니다</b>(연결 = 열람 허용이 아니에요).
            </p>
            <ErrorText>{linkErr}</ErrorText>
            <div style={{ display: 'grid', gap: 8 }}>
              {links.map((l) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14 }}><b>{l.counterpartName}</b>{l.relation ? <span style={{ color: 'var(--muted)' }}> · {l.relation}</span> : null}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{LINK_STATUS[l.status] ?? l.status}</div>
                  </div>
                  {l.canRespond ? (
                    <>
                      <Button size="sm" onClick={() => respond(l.id, 'approve')} disabled={linkBusy}>승인</Button>
                      <Button size="sm" variant="ghost" onClick={() => respond(l.id, 'reject')} disabled={linkBusy}>거절</Button>
                    </>
                  ) : l.status === 'approved' ? (
                    <Button size="sm" variant="ghost" onClick={() => respond(l.id, 'revoke')} disabled={linkBusy}>연결 해제</Button>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 보호자 공유 동의(O105) — 성인 학생 전용 게이트. 미성년은 보호자 권한이라 토글이 열람 여부를 바꾸지 않는다. */}
        {share && share.guardians.length > 0 && (
          <Card>
            <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>보호자에게 내 리포트 공유</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
              {share.isMinor
                ? '미성년 회원은 보호자가 법정대리인 권한으로 열람할 수 있어요(보호자 본인확인·동의 완료 시). 아래 설정은 성인이 되면 적용됩니다.'
                : '동의한 보호자만 내 격차 리포트 이력을 볼 수 있어요. 언제든 철회할 수 있고, 철회하면 바로 볼 수 없게 됩니다.'}
            </p>
            <ErrorText>{shareErr}</ErrorText>
            <div style={{ display: 'grid', gap: 8 }}>
              {share.guardians.map((g) => (
                <div key={g.guardianId} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                      <b>{g.guardianName ?? '보호자'}</b>{g.relation ? <span style={{ color: 'var(--muted)' }}> · {g.relation}</span> : null}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {g.granted ? `동의 중${g.grantedAt ? ` · ${g.grantedAt.slice(0, 10)}` : ''}` : '동의하지 않음'}
                    </div>
                  </div>
                  <Badge kind={g.granted ? 'done' : 'soft'}>{g.granted ? '공유 중' : '비공개'}</Badge>
                  <Button variant={g.granted ? 'ghost' : undefined} onClick={() => toggleShare(g.guardianId, !g.granted)} disabled={shareBusy}>
                    {g.granted ? '철회' : '공유 동의'}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

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
