import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Badge, Button, Spinner, ErrorText, EmptyState } from '../components/ui';

/**
 * 보호자–자녀 연결 복구(O125).
 *
 * 왜 이 화면이 필요한가: O124 가 거절·해제 후 재신청을 열었지만 쿨다운(7일)·횟수(3회)에
 * 걸리면 보호자는 스스로 못 푼다. 학생·보호자 화면은 "관리자에게 문의"라고 안내하는데
 * 정작 관리자가 볼 화면이 없어 **그 문의를 받은 관리자가 할 수 있는 게 없었다**.
 *
 * 강제 복구는 학생 동의 없이 연결을 되살리므로 이 화면은 **왜 막혔는지**(쿨다운/횟수)와
 * **누가 언제 무엇을 했는지**(이력)를 먼저 보여준 뒤에, 2단계 확인을 거쳐 버튼을 준다.
 */
type LinkEvent = {
  from: string | null;
  to: string;
  actorRole: string | null;
  reason: string | null;
  at: string;
};
type AdminLink = {
  id: string;
  status: string;
  relation: string | null;
  linkMethod: string | null;
  guardianName: string;
  guardianLoginId: string | null;
  studentName: string;
  studentLoginId: string | null;
  centerName: string | null;
  canRecover: boolean;
  relinkBlocked: 'cooldown' | 'max_attempts' | null;
  relinkAvailableAt: string | null;
  relinkAttempts: number;
  relinkMaxAttempts: number;
  events: LinkEvent[];
};
/** 배열이 아니라 봉투 — 상한에 잘렸는지를 화면이 알아야 '없음'과 '못 봤음'을 구분한다. */
type LinkPage = { items: AdminLink[]; truncated: boolean; limit: number; scope: 'stuck' | 'all' };

const STATUS_LABEL: Record<string, string> = {
  pending: '학생 승인 대기', approved: '연결됨', rejected: '학생이 거절함', revoked: '연결 해제됨',
};
// Badge 의 kind='rejected' 는 붉은색이 아니라 회색 칩이다 — 끊긴 상태는 danger 로 눈에 띄게 한다.
const STATUS_KIND: Record<string, 'done' | 'new' | 'danger' | 'soft'> = {
  approved: 'done', pending: 'new', rejected: 'danger', revoked: 'danger',
};
const REASON_LABEL: Record<string, string> = {
  request: '보호자 신청', relink: '보호자 재신청', respond: '응답',
  admin_override: '관리자 강제 복구', admin_unlock: '관리자 재신청 잠금 해제',
};
const ROLE_LABEL: Record<string, string> = {
  guardian: '보호자', student: '학생', admin: '관리자', hr: 'HR',
};

const KST = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const KSTDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

export function AdminGuardianLinksPage() {
  const [page, setPage] = useState<LinkPage | null>(null);
  const [q, setQ] = useState('');
  /** 실제로 조회에 쓰인 검색어 — 빈 상태 문구를 입력 중인 값으로 고르면 사실과 다른 말을 한다. */
  const [appliedQ, setAppliedQ] = useState('');
  const [scope, setScope] = useState<'stuck' | 'all'>('stuck');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  // 행별 로딩 — boolean 으로 두면 Button 의 loading 이 모든 행을 '처리 중…' 으로 바꾼다.
  const [busy, setBusy] = useState('');
  const [openId, setOpenId] = useState('');
  /** 강제 복구 2단계 확인 — 학생 동의를 우회하는 조작이라 한 번의 오클릭으로 확정되면 안 된다. */
  const [confirming, setConfirming] = useState('');

  // 검색어는 의존성에 넣지 않는다(타이핑마다 요청). Enter·버튼으로만 호출한다.
  const load = useCallback(async (term: string, sc: 'stuck' | 'all') => {
    setPage(null); setError('');
    try {
      const r = await api.get<LinkPage>(
        `/admin/guardian-links?scope=${sc}${term ? `&q=${encodeURIComponent(term)}` : ''}`,
      );
      setPage(r);
      setAppliedQ(term);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
      // 실패는 '없다'가 아니라 '모른다' — page 를 빈 목록으로 두면 두 상태가 같은 화면이 된다.
      setPage(null);
    }
  }, []);
  useEffect(() => { void load('', scope); }, [load, scope]);

  async function recover(l: AdminLink) {
    setConfirming(''); setBusy(l.id); setMsg(''); setError('');
    try {
      await api.patch(`/guardian/links/${l.id}/respond`, { action: 'approve' });
      await load(appliedQ, scope);
      setMsg(`${l.studentName} · ${l.guardianName} 연결을 복구했어요. 학생에게 알림이 갔습니다.`);
    } catch (e) {
      const m = e instanceof ApiError ? e.message : '복구 실패';
      // 실패 원인이 '이미 상태가 바뀜'인 경우가 흔하다 → 목록을 새로 읽고 나서 오류를 남긴다.
      await load(appliedQ, scope);
      setError(m);
    } finally {
      setBusy('');
    }
  }

  /** 가벼운 복구 — 상태를 바꾸지 않고 보호자가 다시 신청할 수 있게만 한다(승인은 학생 몫). */
  async function unlock(l: AdminLink) {
    setBusy(l.id); setMsg(''); setError('');
    try {
      await api.post(`/admin/guardian-links/${l.id}/unlock`, {});
      await load(appliedQ, scope);
      setMsg(`${l.guardianName} 보호자의 재신청 제한을 풀었어요. 보호자에게 알림이 갔고, 연결은 ${l.studentName} 학생이 승인해야 됩니다.`);
    } catch (e) {
      const m = e instanceof ApiError ? e.message : '해제 실패';
      await load(appliedQ, scope);
      setError(m);
    } finally {
      setBusy('');
    }
  }

  const rows = page?.items ?? null;

  return (
    <div>
      <PageHeader title="보호자 연결 복구" sub="거절·해제로 막힌 연결을 확인하고 복구합니다(자기 센터 학생 한정)" />
      <ErrorText>{error}</ErrorText>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}

      <Card>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="학생·보호자 이름 또는 아이디"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void load(q, scope); }}
          />
          <Button size="sm" onClick={() => void load(q, scope)}>검색</Button>
          {q && <Button size="sm" variant="ghost" onClick={() => { setQ(''); void load('', scope); }}>초기화</Button>}
          <span style={{ flex: 1 }} />
          {/* 기본은 '막힌 연결만' — 이 화면의 목적이고, 전체를 기본으로 두면 정상 연결이 상한을 채운다. */}
          <Button size="sm" variant={scope === 'stuck' ? 'primary' : 'ghost'} onClick={() => setScope('stuck')}>막힌 연결만</Button>
          <Button size="sm" variant={scope === 'all' ? 'primary' : 'ghost'} onClick={() => setScope('all')}>전체</Button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0', display: 'grid', gap: 4 }}>
          <p style={{ margin: 0 }}>
            <b>재신청 잠금 해제</b>(권장) — 보호자가 다시 신청할 수 있게만 합니다.
            연결 여부는 <b>학생이 승인</b>해야 정해지므로 학생의 결정권이 그대로 남습니다.
          </p>
          <p style={{ margin: 0 }}>
            <b>강제 복구</b> — <b>학생 동의 없이</b> 즉시 연결합니다. 법정대리인 확인 등 오프라인 근거가 있을 때만 쓰세요.
          </p>
          <p style={{ margin: 0 }}>둘 다 감사 로그와 연결 이력에 남습니다.</p>
        </div>
      </Card>

      <div style={{ height: 12 }} />

      {page?.truncated && (
        <Card>
          <p style={{ fontSize: 13, margin: 0 }}>
            결과가 {page.limit}건을 넘어 <b>일부만 표시</b>했습니다. 학생·보호자 이름이나 아이디로 검색해 좁혀 주세요.
          </p>
        </Card>
      )}

      {rows === null ? (
        error ? <Card><EmptyState>목록을 불러오지 못했습니다. 위 오류를 확인하고 다시 시도해 주세요.</EmptyState></Card> : <Spinner />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState>
            {appliedQ
              ? `'${appliedQ}' 에 해당하는 연결이 없습니다.`
              : scope === 'stuck'
                ? '거절·해제로 막힌 연결이 없습니다.'
                : '연결이 없습니다.'}
          </EmptyState>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((l) => (
            <Card key={l.id}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 14.5 }}>
                    <b>{l.studentName}</b>
                    <span style={{ color: 'var(--muted)' }}>{l.studentLoginId ? ` (${l.studentLoginId})` : ''}</span>
                    <span style={{ color: 'var(--muted)' }}> ← </span>
                    <b>{l.guardianName}</b>
                    <span style={{ color: 'var(--muted)' }}>{l.guardianLoginId ? ` (${l.guardianLoginId})` : ''}</span>
                    {l.relation ? <span style={{ color: 'var(--muted)' }}> · {l.relation}</span> : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                    {l.centerName ?? '센터 미지정'}{l.linkMethod ? ` · ${l.linkMethod}` : ''}
                  </div>
                  {/* 왜 막혔는지 — 이게 없으면 관리자는 개입이 필요한지조차 판단할 수 없다. */}
                  {l.relinkBlocked === 'cooldown' && l.relinkAvailableAt && (
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                      보호자 재신청 <b>쿨다운 중</b> — {KSTDate(l.relinkAvailableAt)}부터 스스로 재신청할 수 있어요.
                      급하지 않다면 기다리는 편이 낫습니다.
                    </div>
                  )}
                  {l.relinkBlocked === 'max_attempts' && (
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                      보호자 재신청 <b>횟수 소진</b>({l.relinkAttempts}/{l.relinkMaxAttempts}) — 관리자 개입 외에는 길이 없습니다.
                    </div>
                  )}
                  {l.canRecover && !l.relinkBlocked && (
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                      보호자가 지금 스스로 재신청할 수 있는 상태예요(재신청 {l.relinkAttempts}/{l.relinkMaxAttempts}).
                    </div>
                  )}
                  {confirming === l.id && (
                    <div style={{ fontSize: 13, marginTop: 6 }}>
                      <b>{l.studentName}</b> 학생이 끊은 연결을 <b>학생 동의 없이</b> 되살립니다.
                      보호자 <b>{l.guardianName}</b> 가 즉시 자녀 정보에 접근하게 되고, 학생에게 복구 알림이 갑니다.
                      이 화면에서는 되돌릴 수 없습니다. 진행할까요?
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Badge kind={STATUS_KIND[l.status] ?? 'soft'}>{STATUS_LABEL[l.status] ?? l.status}</Badge>
                  {confirming === l.id ? (
                    <>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirming('')}>취소</Button>
                      <Button size="sm" loading={busy === l.id} disabled={!!busy} onClick={() => void recover(l)}>복구 확정</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === l.id ? '' : l.id)}>
                        이력 {l.events.length > 0 ? `(${l.events.length})` : ''}
                      </Button>
                      {/* 권장 경로를 primary 로 둔다 — 학생 동의를 지키면서 교착만 푸는 쪽이
                          더 눈에 띄어야 관리자가 습관적으로 강제 승인을 쓰지 않는다. */}
                      {l.relinkBlocked && (
                        <Button size="sm" loading={busy === l.id} disabled={!!busy} onClick={() => void unlock(l)}>
                          재신청 잠금 해제
                        </Button>
                      )}
                      {l.canRecover && (
                        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirming(l.id)}>강제 복구</Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {openId === l.id && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  {l.events.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
                      기록된 이력이 없습니다(0105 마이그레이션 이전에 만들어진 연결).
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gap: 4 }}>
                      {l.events.map((e, i) => (
                        <div key={i} style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 8 }}>
                          <span style={{ whiteSpace: 'nowrap' }}>{KST(e.at)}</span>
                          {/* 잠금 해제는 전이가 아니라 주석(from === to)이라 화살표를 쓰면 거짓말이 된다. */}
                          {e.reason === 'admin_unlock' ? (
                            <span><b>{REASON_LABEL.admin_unlock}</b> · {ROLE_LABEL[e.actorRole ?? ''] ?? e.actorRole ?? '?'} · 상태 변화 없음</span>
                          ) : (
                            <span>
                              {e.from ? `${STATUS_LABEL[e.from] ?? e.from} → ` : ''}
                              <b>{STATUS_LABEL[e.to] ?? e.to}</b>
                              {' · '}{ROLE_LABEL[e.actorRole ?? ''] ?? e.actorRole ?? '?'}
                              {e.reason ? ` · ${REASON_LABEL[e.reason] ?? e.reason}` : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
