import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { BlockedTime, Room, ZoomPolicy } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText, EmptyState } from '../components/ui';
import { useAuth } from '../auth/AuthContext';

const ZDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const ZHOURS = [14, 15, 16, 17, 18, 19, 20];

type RtMode = 'off' | 'all' | 'premium';
type RtFeatures = { chat: RtMode; whiteboard: RtMode; notif: RtMode };
const RT_ITEMS: { key: keyof RtFeatures; label: string; desc: string }[] = [
  { key: 'chat', label: '실시간 채팅', desc: '예약된 상담의 학생↔선생님 1:1 채팅' },
  { key: 'whiteboard', label: '화이트보드', desc: '상담 중 공유 필기 보드' },
  { key: 'notif', label: '실시간 알림', desc: '접속 중 즉시 알림 푸시(토스트)' },
];
const RT_MODE_LABEL: Record<RtMode, string> = { off: '사용 안 함', all: '전체 제공', premium: '프리미엄 전용' };

type DashPolicy = { teacherEnabled: boolean; centerAdminTabs: string[]; teacherTabs: string[]; disabledCenters: string[] };
const CA_TABS: { key: string; label: string }[] = [{ key: 'summary', label: '센터 요약' }, { key: 'teachers', label: '선생님별 비교' }, { key: 'trend', label: '월별 추이' }];
const TE_TABS: { key: string; label: string }[] = [{ key: 'summary', label: '지표 요약' }, { key: 'rank', label: '센터 내 순위' }, { key: 'trend', label: '월별 추이' }];

export function AdminInfraPage() {
  const { user } = useAuth();
  const isHq = user?.role === 'admin' && !user?.center_id;
  const [rt, setRt] = useState<RtFeatures | null>(null);
  const [rev, setRev] = useState<{ offlineOnly: boolean; free: boolean } | null>(null);
  const [ext, setExt] = useState<{ onlineOnly: boolean; surchargePct: number; weeklyGrant: boolean; boardOnly: boolean } | null>(null);
  const [surIn, setSurIn] = useState('');
  const [dash, setDash] = useState<DashPolicy | null>(null);
  const [dashCenters, setDashCenters] = useState<{ id: string; name: string }[]>([]);
  const [zoom, setZoom] = useState<number>(6);
  const [zoomUsage, setZoomUsage] = useState<number>(0);
  const [allowMap, setAllowMap] = useState<Record<string, boolean>>({});
  const [rooms, setRooms] = useState<Room[]>([]);
  const [blocked, setBlocked] = useState<BlockedTime[]>([]);
  const [roomForm, setRoomForm] = useState({ type: '', capacity: 1 });
  const [blockForm, setBlockForm] = useState({ type: '', startAt: '', endAt: '', scope: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    // 전사 정책(실시간·대시보드)은 센터 스코프와 독립적으로 로드 — 본사 마스터(센터 미소속)도
    // 줌/상담실 조회 실패와 무관하게 정책 카드를 볼 수 있어야 함.
    api.get<RtFeatures>('/admin/realtime/policy').then(setRt).catch(() => {});
    api.get<{ offlineOnly: boolean; free: boolean }>('/bookings/reverse/policy').then(setRev).catch(() => {});
    api.get<{ onlineOnly: boolean; surchargePct: number; weeklyGrant: boolean; boardOnly: boolean }>('/bookings/external/policy').then((e) => { setExt(e); setSurIn(String(e.surchargePct)); }).catch(() => {});
    api.get<DashPolicy>('/admin/dashboard/policy').then(setDash).catch(() => {});
    if (isHq) api.get<{ id: string; name: string }[]>('/centers').then(setDashCenters).catch(() => {});
    // 센터 스코프 자원(줌·상담실·차단) — 본사 마스터는 센터가 없어 실패할 수 있음(무시).
    try {
      const zp = await api.get<ZoomPolicy>('/admin/zoom-policy');
      setZoom(zp.concurrent_limit);
      setAllowMap(zp.allow_map ?? {});
      setZoomUsage(zp.currentUsage ?? 0);
      setRooms(await api.get<Room[]>('/admin/rooms'));
      setBlocked(await api.get<BlockedTime[]>('/admin/blocked-times'));
      setError('');
    } catch (e) {
      // 본사 마스터(센터 미소속)는 센터 자원 조회가 막힘 — 정책 카드는 계속 보이므로 조용히 무시.
      if (!isHq) setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, [isHq]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg('');
    setError('');
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '실패');
    }
  };

  return (
    <div>
      <PageHeader title="줌 · 상담실 · 차단" />
      <ErrorText>{error}</ErrorText>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}

      {rt && (
        <Card title="실시간 상담 기능 정책" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 0 }}>
            채팅·화이트보드·실시간 알림을 전사 정책으로 제어합니다. <b>프리미엄 전용</b>은 프리미엄 등급 학생에게만 열립니다(선생님·직원은 항상 사용).
            {!isHq && <span style={{ color: 'var(--chip-rejected,#c0392b)' }}> · 변경은 본사 마스터관리자만 가능합니다.</span>}
          </p>
          <div style={{ display: 'grid', gap: 10, maxWidth: 620 }}>
            {RT_ITEMS.map((it) => (
              <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{it.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{it.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['off', 'all', 'premium'] as RtMode[]).map((m) => {
                    const active = rt[it.key] === m;
                    return (
                      <button key={m} disabled={!isHq}
                        onClick={() => run(async () => { const next = await api.put<RtFeatures>('/admin/realtime/policy', { [it.key]: m }); setRt(next); }, `${it.label} 정책 저장됨`)}
                        style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: isHq ? 'pointer' : 'not-allowed', opacity: isHq ? 1 : 0.6,
                          border: active ? '1px solid var(--teal)' : '1px solid var(--line)', background: active ? 'var(--teal)' : 'var(--surface)', color: active ? '#fff' : 'var(--muted)' }}>
                        {RT_MODE_LABEL[m]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {rev && (
        <Card title="역상담 정책" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 0 }}>
            선생님이 먼저 제안하는 역상담의 전사 규칙입니다.
            {!isHq && <span style={{ color: 'var(--chip-rejected,#c0392b)' }}> · 변경은 본사 마스터관리자만 가능합니다.</span>}
          </p>
          <div style={{ display: 'grid', gap: 10, maxWidth: 620 }}>
            {([
              { key: 'offlineOnly' as const, label: '오프라인 대면만 허용', desc: '역상담을 오프라인 상담으로 한정(줌·채팅·필기 제외) · 본사 관리자' },
              { key: 'free' as const, label: '크레딧 미소모', desc: '역상담은 크레딧을 차감하지 않음 · 마스터관리자' },
            ]).map((it) => (
              <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{it.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{it.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([true, false] as const).map((v) => {
                    const active = rev[it.key] === v;
                    return (
                      <button key={String(v)} disabled={!isHq}
                        onClick={() => run(async () => { const next = await api.patch<{ offlineOnly: boolean; free: boolean }>(`/bookings/reverse/policy`, { [it.key]: v }); setRev(next); }, `${it.label} 정책 저장됨`)}
                        style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: isHq ? 'pointer' : 'not-allowed', opacity: isHq ? 1 : 0.6,
                          border: active ? '1px solid var(--teal)' : '1px solid var(--line)', background: active ? 'var(--teal)' : 'var(--surface)', color: active ? '#fff' : 'var(--muted)' }}>
                        {v ? '켬' : '끔'}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {ext && (
        <Card title="외부학생 정책" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 0 }}>
            학원생(재원)과 구분되는 외부학생의 전사 규칙입니다. 접근(온라인 한정·상담 제한)은 본사, 요금·크레딧은 마스터관리자가 설정합니다.
            {!isHq && <span style={{ color: 'var(--chip-rejected,#c0392b)' }}> · 변경은 본사 마스터관리자만 가능합니다.</span>}
          </p>
          <div style={{ display: 'grid', gap: 10, maxWidth: 620 }}>
            {([
              { key: 'onlineOnly' as const, label: '온라인 상담만 허용', desc: '외부학생은 오프라인 대면·상담실 배정 불가 + 검색·자동매칭에 온라인 선생님만 노출. 끄면 오프라인까지 노출·예약 허용 · 본사 관리자' },
              { key: 'boardOnly' as const, label: '상담 예약 제한(게시판만)', desc: '외부학생은 상담 예약 불가, 게시판 질문만 이용 · 본사 관리자' },
              { key: 'weeklyGrant' as const, label: '주간 크레딧 부여', desc: '외부학생에게도 주간 크레딧 부여(기본 제외) · 마스터관리자' },
            ]).map((it) => (
              <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{it.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{it.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([true, false] as const).map((v) => {
                    const active = ext[it.key] === v;
                    return (
                      <button key={String(v)} disabled={!isHq}
                        onClick={() => run(async () => { const next = await api.patch<typeof ext>(`/bookings/external/policy`, { [it.key]: v }); setExt(next!); setSurIn(String(next!.surchargePct)); }, `${it.label} 정책 저장됨`)}
                        style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: isHq ? 'pointer' : 'not-allowed', opacity: isHq ? 1 : 0.6,
                          border: active ? '1px solid var(--teal)' : '1px solid var(--line)', background: active ? 'var(--teal)' : 'var(--surface)', color: active ? '#fff' : 'var(--muted)' }}>
                        {v ? '켬' : '끔'}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* 요금 할증률 — 마스터관리자 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>요금 할증률 (%)</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>외부학생 상담료에 붙는 할증 · 마스터관리자 (0~300)</div>
              </div>
              <input type="number" min={0} max={300} value={surIn} disabled={!isHq} onChange={(e) => setSurIn(e.target.value)}
                style={{ width: 80, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', textAlign: 'right' }} />
              <button disabled={!isHq}
                onClick={() => run(async () => { const next = await api.patch<typeof ext>(`/bookings/external/policy`, { surchargePct: Number(surIn) }); setExt(next!); setSurIn(String(next!.surchargePct)); }, '할증률 저장됨')}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: isHq ? 'pointer' : 'not-allowed', opacity: isHq ? 1 : 0.6, border: '1px solid var(--teal)', background: 'var(--teal)', color: '#fff' }}>저장</button>
            </div>
          </div>
        </Card>
      )}

      {dash && (
        <Card title="대시보드 노출 정책" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 0 }}>
            센터 관리자·선생님에게 보일 대시보드 탭과 센터별 노출 여부를 본사에서 제어합니다.
            {!isHq && <span style={{ color: 'var(--chip-rejected,#c0392b)' }}> · 변경은 본사 마스터관리자만 가능합니다.</span>}
          </p>
          {/* 선생님 대시보드 on/off */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <b style={{ fontSize: 14, flex: 1 }}>선생님 성과 대시보드 노출</b>
            <button disabled={!isHq} onClick={() => run(async () => setDash(await api.put<DashPolicy>('/admin/dashboard/policy', { teacherEnabled: !dash.teacherEnabled })), '대시보드 정책 저장됨')}
              style={{ cursor: isHq ? 'pointer' : 'not-allowed', border: 'none', background: 'none', padding: 0 }}>
              <span style={{ display: 'inline-block', width: 40, height: 22, borderRadius: 999, background: dash.teacherEnabled ? 'var(--teal)' : 'var(--line)', position: 'relative', transition: '.15s' }}>
                <span style={{ position: 'absolute', top: 2, left: dash.teacherEnabled ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: '.15s' }} />
              </span>
            </button>
          </div>
          {/* 탭 노출 체크 */}
          {([['centerAdminTabs', '센터 관리자 탭', CA_TABS], ['teacherTabs', '선생님 탭', TE_TABS]] as const).map(([field, label, opts]) => (
            <div key={field} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{label}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {opts.map((o) => {
                  const on = dash[field].includes(o.key);
                  return (
                    <button key={o.key} disabled={!isHq}
                      onClick={() => run(async () => { const next = on ? dash[field].filter((x) => x !== o.key) : [...dash[field], o.key]; setDash(await api.put<DashPolicy>('/admin/dashboard/policy', { [field]: next })); }, '대시보드 정책 저장됨')}
                      style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: isHq ? 'pointer' : 'not-allowed', opacity: isHq ? 1 : 0.6,
                        border: on ? '1px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal)' : 'var(--surface)', color: on ? '#fff' : 'var(--muted)' }}>
                      {on ? '✓ ' : ''}{o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {/* 센터별 노출 여부(본사만) */}
          {isHq && dashCenters.length > 0 && (
            <div style={{ padding: '10px 0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>센터별 노출 (끄면 해당 센터 관리자·선생님 대시보드 숨김)</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {dashCenters.map((c) => {
                  const off = dash.disabledCenters.includes(c.id);
                  return (
                    <button key={c.id}
                      onClick={() => run(async () => { const next = off ? dash.disabledCenters.filter((x) => x !== c.id) : [...dash.disabledCenters, c.id]; setDash(await api.put<DashPolicy>('/admin/dashboard/policy', { disabledCenters: next })); }, '센터 노출 저장됨')}
                      style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                        border: off ? '1px solid var(--danger,#c0392b)' : '1px solid var(--teal)', background: off ? '#FAD9D9' : 'var(--teal-50,#F0F7FA)', color: off ? '#c0392b' : 'var(--teal)' }}>
                      {off ? '🚫 ' : '✓ '}{c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card title="줌 가능 시간" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <label className="label" style={{ margin: 0 }}>동시 줌 한도</label>
          <input className="input" style={{ width: 90 }} type="number" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          <Button size="sm" onClick={() => run(() => api.put('/admin/zoom-policy', { concurrentLimit: zoom, allowMap }), '줌 설정 저장됨')}>저장</Button>
          <Badge kind={zoomUsage >= zoom ? 'rejected' : zoomUsage >= zoom - 1 ? 'confirmed' : 'soft'}>
            현재 {zoomUsage}/{zoom}{zoomUsage >= zoom ? ' · 만석' : zoomUsage >= zoom - 1 ? ' · 한도 임박' : ''}
          </Badge>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>칸을 클릭해 허용/차단을 토글하세요.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `46px repeat(7, 1fr)`, gap: 4, maxWidth: 560 }}>
          <div />
          {ZDAYS.map((d) => <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{d}</div>)}
          {ZHOURS.map((h) => (
            <div key={h} style={{ display: 'contents' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', paddingRight: 4, alignSelf: 'center' }}>{h}시</div>
              {ZDAYS.map((_, di) => {
                const key = `${di}-${h}`;
                const allowed = allowMap[key] !== false;
                return (
                  <button key={key} onClick={() => setAllowMap((p) => ({ ...p, [key]: !(p[key] !== false) }))}
                    style={{ height: 26, borderRadius: 6, cursor: 'pointer', border: allowed ? '1px solid #AFC8F4' : '1px solid var(--line)', background: allowed ? '#D6E4FB' : '#f4f6f7', color: allowed ? '#2563EB' : 'var(--muted)', fontSize: 10, fontWeight: 700 }}>
                    {allowed ? '허용' : '차단'}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#D6E4FB', border: '1px solid #AFC8F4', verticalAlign: 'middle', marginRight: 4 }} />허용</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#f4f6f7', border: '1px solid var(--line)', verticalAlign: 'middle', marginRight: 4 }} />차단</span>
        </div>
      </Card>

      <Card title="상담실" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <label className="label">유형</label>
            <input className="input" style={{ width: 120 }} value={roomForm.type} onChange={(e) => setRoomForm((p) => ({ ...p, type: e.target.value }))} />
          </div>
          <div>
            <label className="label">정원</label>
            <input className="input" style={{ width: 80 }} type="number" value={roomForm.capacity} onChange={(e) => setRoomForm((p) => ({ ...p, capacity: Number(e.target.value) }))} />
          </div>
          <Button size="sm" onClick={() => run(() => api.post('/admin/rooms', roomForm), '상담실 추가됨')}>추가</Button>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {rooms.length === 0 && <EmptyState>상담실이 없습니다.</EmptyState>}
          {rooms.map((r) => (
            <div key={r.id} style={{ fontSize: 13, color: 'var(--muted)' }}>
              {r.type ?? '-'} · 정원 {r.capacity} · <Badge kind="soft">{r.status}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card title="차단 시간(슬롯에 즉시 반영)">
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="label">유형</label>
            <input className="input" style={{ width: 120 }} value={blockForm.type} onChange={(e) => setBlockForm((p) => ({ ...p, type: e.target.value }))} />
          </div>
          <div>
            <label className="label">시작</label>
            <input className="input" style={{ width: 200 }} type="datetime-local" value={blockForm.startAt} onChange={(e) => setBlockForm((p) => ({ ...p, startAt: e.target.value }))} />
          </div>
          <div>
            <label className="label">종료</label>
            <input className="input" style={{ width: 200 }} type="datetime-local" value={blockForm.endAt} onChange={(e) => setBlockForm((p) => ({ ...p, endAt: e.target.value }))} />
          </div>
          <Button
            size="sm"
            disabled={!blockForm.startAt || !blockForm.endAt}
            onClick={() =>
              run(
                () =>
                  api.post('/admin/blocked-times', {
                    type: blockForm.type || undefined,
                    startAt: new Date(blockForm.startAt).toISOString(),
                    endAt: new Date(blockForm.endAt).toISOString(),
                    scope: blockForm.scope || undefined,
                  }),
                '차단 추가됨',
              )
            }
          >
            추가
          </Button>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {blocked.length === 0 && <EmptyState>차단 시간이 없습니다.</EmptyState>}
          {blocked.map((b) => (
            <div key={b.id} style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>
                {b.type ?? '-'} · {new Date(b.start_at).toLocaleString('ko-KR')} ~ {new Date(b.end_at).toLocaleString('ko-KR')}
              </span>
              <Button size="sm" variant="ghost" onClick={() => run(() => api.del(`/admin/blocked-times/${b.id}`), '차단 삭제됨')}>
                삭제
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
