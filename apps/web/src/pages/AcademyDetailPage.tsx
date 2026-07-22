import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';

/* 학원 상세(스펙 §7-2) — 반 테이블·버스 아코디언·재원생 통계·상담 신청·재원 동의. */
type Cls = { id: string; subject: string; targetGrades: string[]; level: string; schedule: { dow: string; start: string; end: string }[]; capacity: number | null; tuitionKrw: number | null; tuitionLabel: string; entryTest: boolean };
type Route = { id: string; name: string; days: string[]; direction: string; stops: { seq: number; name: string; dongCode: string | null; timeHint: string | null }[] };
type Cohort = { kind: string; period: string; payload: unknown; source: string; sourceLabel: string; nTotal: number | null };
type Detail = { id: string; name: string; addr: string | null; phone: string | null; sourceLabel: string; claimStatus: string; nearestStation: { name?: string; walk_min?: number } | null; classes: Cls[]; busRoutes: Route[]; cohortStats: Cohort[] };
type Preview = { name: string | null; grade: string | null; goalTier: string | null };

const LEVEL_KO: Record<string, string> = { basic: '기초', regular: '일반', advanced: '심화', prep: '실전' };
const LEVEL_BG: Record<string, string> = { basic: '#eef4ff', regular: '#eafaf1', advanced: '#fff4e6', prep: '#fdecec' };
const won = (n: number | null) => (n == null ? '-' : `${n.toLocaleString()}원`);

export function AcademyDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [openRoute, setOpenRoute] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  // 재원 동의
  const [enrolled, setEnrolled] = useState(false);
  const [school, setSchool] = useState('');

  // 상담 신청 시트
  const [sheet, setSheet] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lead, setLead] = useState({ shareName: true, shareGrade: true, shareGoal: false, contact: '', message: '', classId: '' });
  const setL = (k: keyof typeof lead, v: string | boolean) => setLead((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setErr('');
    try { setD(await api.get<Detail>(`/academies/${id}`)); } catch (e) { setErr(e instanceof ApiError ? e.message : '조회 실패'); }
  }, [id]);
  useEffect(() => { void load(); api.get<{ academyId: string; consentStats: boolean; school: string | null }[]>('/enrollments/mine').then((rows) => { const me = rows.find((r) => r.academyId === id); if (me) { setEnrolled(true); setSchool(me.school ?? ''); } }).catch(() => {}); }, [id, load]);

  async function toggleEnroll(consent: boolean) {
    setMsg('');
    try {
      if (enrolled && !consent) { await api.del(`/enrollments/${id}`); setEnrolled(false); setMsg('재원 표시를 해제했어요.'); }
      else { await api.post('/enrollments', { academyId: id, consentStats: consent, school: school || undefined }); setEnrolled(true); setMsg(consent ? '재원 표시 + 통계 동의가 등록됐어요.' : '재원 표시가 등록됐어요.'); }
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '처리 실패'); }
  }

  async function openSheet() {
    setSheet(true); setMsg('');
    try { setPreview(await api.get<Preview>('/leads/preview')); } catch { setPreview(null); }
  }
  async function submitLead() {
    setMsg('');
    try {
      const r = await api.post<{ consentScope: string[] }>(`/academies/${id}/leads`, {
        classId: lead.classId || undefined, message: lead.message || undefined, contact: lead.contact || undefined,
        shareName: lead.shareName, shareGrade: lead.shareGrade, shareGoal: lead.shareGoal,
      });
      setSheet(false); setMsg(`상담 신청이 전송됐어요. 공유 항목: ${r.consentScope.join(', ') || '없음'}. 응답은 '내 신청'에서 확인하세요.`);
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '신청 실패'); }
  }

  if (err) return <div><button className="btn btn-ghost" onClick={() => nav(-1)}>← 뒤로</button><p style={{ color: 'var(--danger,#c0392b)' }}>{err}</p></div>;
  if (!d) return <p style={{ color: 'var(--muted)' }}>불러오는 중…</p>;

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--fill,#f4f7fb)' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderTop: '1px solid var(--line)' };

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => nav('/student/academies')} style={{ marginBottom: 10 }}>← 학원찾기</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ margin: 0 }}>{d.name}</h1>
        {d.claimStatus === 'approved' && <span style={{ fontSize: 11, fontWeight: 700, color: '#1f6feb', background: 'var(--teal-50,#E8F0F9)', borderRadius: 6, padding: '2px 8px' }}>운영자 관리</span>}
      </div>
      <p className="page-sub">{d.addr ?? '주소 미상'}{d.nearestStation?.name ? ` · ${d.nearestStation.name}역 도보 ${d.nearestStation.walk_min ?? '?'}분` : ''} · 출처 {d.sourceLabel}</p>

      {msg && <p style={{ color: 'var(--teal,#1f6feb)', fontSize: 13 }}>{msg}</p>}

      <div style={{ display: 'flex', gap: 8, margin: '10px 0 18px', flexWrap: 'wrap' }}>
        <button className="btn" onClick={openSheet}>상담 신청</button>
        {!enrolled
          ? <button className="btn btn-ghost" onClick={() => toggleEnroll(true)}>재원 중 표시 + 통계 동의</button>
          : <button className="btn btn-ghost" onClick={() => toggleEnroll(false)}>재원 표시 해제</button>}
      </div>

      {/* 반 테이블 */}
      <section className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 14px', fontWeight: 700 }}>반 정보</div>
        {d.classes.length === 0 ? <p style={{ padding: 14, color: 'var(--muted)', fontSize: 13 }}>등록된 반이 없어요.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>과목</th><th style={th}>레벨</th><th style={th}>대상학년</th><th style={th}>시간</th><th style={th}>수강료</th></tr></thead>
            <tbody>
              {d.classes.map((c) => (
                <tr key={c.id}>
                  <td style={td}><b>{c.subject}</b>{c.entryTest && <span style={{ fontSize: 11, color: 'var(--muted)' }}> · 입반테스트</span>}</td>
                  <td style={td}><span style={{ fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '2px 7px', background: LEVEL_BG[c.level] ?? '#eee' }}>{LEVEL_KO[c.level] ?? c.level}</span></td>
                  <td style={td}>{c.targetGrades.join(', ') || '-'}</td>
                  <td style={td}>{c.schedule?.map((s) => `${s.dow} ${s.start}~${s.end}`).join(', ') || '-'}</td>
                  <td style={td}>{won(c.tuitionKrw)} <span style={{ fontSize: 11, color: 'var(--muted)' }}>({c.tuitionLabel})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 버스 노선 아코디언 */}
      {d.busRoutes.length > 0 && (
        <section className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>🚌 학원버스</div>
          {d.busRoutes.map((r) => (
            <div key={r.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
              <button onClick={() => setOpenRoute(openRoute === r.id ? null : r.id)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}>
                <b style={{ flex: 1, fontSize: 14 }}>{r.name} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>{r.days.join('·')} · {r.direction === 'pickup' ? '등원' : '하원'}</span></b>
                <span style={{ color: 'var(--muted)' }}>{openRoute === r.id ? '▲' : '▼'}</span>
              </button>
              {openRoute === r.id && (
                <ol style={{ margin: '8px 0 4px', paddingLeft: 20, fontSize: 13 }}>
                  {r.stops.map((s) => <li key={s.seq} style={{ padding: '2px 0' }}>{s.name}{s.timeHint ? ` (${s.timeHint})` : ''}</li>)}
                </ol>
              )}
            </div>
          ))}
        </section>
      )}

      {/* 재원생 통계 */}
      {d.cohortStats.length > 0 && (
        <section className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>재원생 통계</div>
          {d.cohortStats.map((cs, i) => <CohortView key={i} cs={cs} />)}
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>※ 개별 학생 정보가 아닌 집계입니다. 출처 라벨을 확인하세요.</p>
        </section>
      )}

      {/* 상담 신청 시트 */}
      {sheet && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }} onClick={() => setSheet(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: 20, borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>상담 신청 — {d.name}</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>선택한 항목만 학원에 전달됩니다. 성적 상세는 전달되지 않아요.</p>

            <label style={{ fontSize: 12, color: 'var(--muted)' }}>관심 반(선택)</label>
            <select className="input" value={lead.classId} onChange={(e) => setL('classId', e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
              <option value="">지정 안 함</option>
              {d.classes.map((c) => <option key={c.id} value={c.id}>{c.subject} · {LEVEL_KO[c.level] ?? c.level}</option>)}
            </select>

            <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
              <b style={{ fontSize: 13 }}>전달 정보 미리보기(동의 항목만)</b>
              <label style={{ fontSize: 13, display: 'flex', gap: 6 }}><input type="checkbox" checked={lead.shareName} onChange={(e) => setL('shareName', e.target.checked)} /> 이름: {preview?.name ?? '—'}</label>
              <label style={{ fontSize: 13, display: 'flex', gap: 6 }}><input type="checkbox" checked={lead.shareGrade} onChange={(e) => setL('shareGrade', e.target.checked)} /> 학년: {preview?.grade ?? '—'}</label>
              <label style={{ fontSize: 13, display: 'flex', gap: 6 }}><input type="checkbox" checked={lead.shareGoal} onChange={(e) => setL('shareGoal', e.target.checked)} /> 목표 라인: {preview?.goalTier ?? '—'}</label>
            </div>
            <input className="input" placeholder="연락처(선택)" value={lead.contact} onChange={(e) => setL('contact', e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
            <textarea className="input" placeholder="문의 내용(선택)" value={lead.message} onChange={(e) => setL('message', e.target.value)} style={{ width: '100%', minHeight: 70, marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setSheet(false)} style={{ flex: 1 }}>취소</button>
              <button className="btn" onClick={submitLead} style={{ flex: 2 }}>신청 전송</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 재원생 통계 1건 — grade_band 는 밴드 막대 %, school_dist 는 학교 분포. 출처 라벨 상시. */
function CohortView({ cs }: { cs: Cohort }) {
  const label = <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 7px', marginLeft: 6, color: cs.source === 'verified' ? '#1f7a52' : 'var(--muted)', background: cs.source === 'verified' ? '#e3f3ea' : 'var(--fill,#f4f7fb)' }}>{cs.sourceLabel}</span>;
  if (cs.kind === 'grade_band') {
    const bands = (cs.payload ?? {}) as Record<string, Record<string, number>>;
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>성적대 분포 {label}</div>
        {Object.entries(bands).map(([exam, dist]) => (
          <div key={exam} style={{ margin: '6px 0' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{exam}</div>
            {Object.entries(dist).map(([band, pct]) => (
              <div key={band} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0' }}>
                <span style={{ width: 36, fontSize: 12 }}>{band}</span>
                <div style={{ flex: 1, background: 'var(--fill,#eef2f7)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, background: 'var(--teal,#1f6feb)', height: '100%' }} />
                </div>
                <span style={{ width: 34, fontSize: 12, textAlign: 'right' }}>{pct}%</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  const schools = (cs.payload ?? []) as { school: string; n: number }[];
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>출신학교 분포 {label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        {schools.map((s) => <span key={s.school} style={{ fontSize: 12, border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px' }}>{s.school} {s.n}명</span>)}
      </div>
    </div>
  );
}
