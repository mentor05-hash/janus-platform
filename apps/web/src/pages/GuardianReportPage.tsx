import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { JanusLogo } from '../components/JanusLogo';
import { ScoreTrend, type Trend } from '../components/ScoreTrend';

// 상담 기록 상세(학부모에게 final·공개분만) — GET /students/{id}/notes
type Note = { bookingId: string; teacherId: string; consultType: string | null; coreSummary: string | null; homework: string | null; futureDir: string | null; teacherName?: string | null; createdAt: string };

/** 학부모 주간 통합 리포트 — 자녀 성적·출석·상담·Q&A 요약(야누스에서만 생성). */
type Child = { studentId: string; name: string }; // GET /guardian/children(people) 형태의 부분집합
/** 자녀 격차 리포트 이력 행(payload=트렁크 JanusReport 봉투). 열람은 O105 연령 게이트를 통과해야 한다. */
type GapHist = {
  id: string; created_at: string;
  payload: {
    unit: { label: string; suffix: string };
    gap: { band: string; shortfall: number };
    target: { univ: string; dept: string; cut: number };
    generatedFor: { value: number };
  };
};
const HIST_BAND_COLOR: Record<string, string> = { 안정: '#2A8A5F', 적정: '#2F6FB3', 소신: '#CF9A3A', 상향: '#E5484D' };
type Report = {
  kind: string; version: string;
  student: { name: string };
  period: { days: number };
  headline: string;
  sections: {
    score: { gye: string | null; mode: string; nb?: number; label: string } | null;
    attendance: { done: number; upcoming: number; noshow: number; cancelled: number; rate: number | null; label: string };
    consultation: { count: number; recent: Array<{ at: string; teacher?: string; summary: string | null }> };
    qna: { count: number };
  };
  disclaimer: string;
};

const KST = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

export function GuardianReportPage() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [sel, setSel] = useState<string>('');
  const [report, setReport] = useState<Report | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [access, setAccess] = useState<{ showTrend: boolean; showPlacement: boolean } | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 보호자 동의(본부 결정 2026-07-19) — 상담 녹음·AI 요약(외부 STT)은 동의 자녀에 한해 제공.
  const [consent, setConsent] = useState<{ granted: boolean; grantedAt: string | null; retentionDays: number } | null>(null);
  // 자녀 산출물 이력(janus_report) — O105 게이트 통과 시에만 온다. 403 이면 사유를 안내한다.
  const [gapHist, setGapHist] = useState<GapHist[] | null>(null);
  const [gapGate, setGapGate] = useState<string>('');
  const [consentBusy, setConsentBusy] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'guardian') return;
    api.get<Child[]>('/guardian/children')
      .then((cs) => { setChildren(cs); if (cs[0]) setSel(cs[0].studentId); })
      .catch(() => setChildren([]));
    api.get<{ showTrend: boolean; showPlacement: boolean }>('/me/scores/access')
      .then(setAccess).catch(() => setAccess({ showTrend: false, showPlacement: false }));
  }, [user]);

  useEffect(() => {
    if (!sel) return;
    setReport(null); setTrend(null); setNotes(null); setErr(null);
    api.get<Report>(`/guardian/report?studentId=${encodeURIComponent(sel)}`)
      .then(setReport)
      .catch((e) => setErr(e?.message ?? '리포트를 불러오지 못했습니다.'));
    api.get<Note[]>(`/students/${encodeURIComponent(sel)}/notes`)
      .then((ns) => setNotes(Array.isArray(ns) ? ns : [])).catch(() => setNotes([]));
    // 자녀 산출물 이력 — 게이트(O105) 미충족이면 403 이 오고, 사유를 그대로 안내한다.
    setGapHist(null); setGapGate('');
    api.get<GapHist[]>(`/guardian/reports?studentId=${encodeURIComponent(sel)}&kind=gap&limit=5`)
      .then((r) => setGapHist(Array.isArray(r) ? r : []))
      .catch((e) => { setGapHist([]); setGapGate(e?.message ?? '열람 권한이 없습니다.'); });
  }, [sel]);

  useEffect(() => {
    if (!sel || !access?.showTrend) { setTrend(null); return; }
    api.get<{ granted: boolean; grantedAt: string | null; retentionDays: number }>(`/media/guardian-consent/${encodeURIComponent(sel)}`)
      .then(setConsent)
      .catch(() => setConsent(null));
    api.get<Trend>(`/guardian/scores/trend?studentId=${encodeURIComponent(sel)}`)
      .then(setTrend).catch(() => setTrend(null));
  }, [sel, access?.showTrend]);

  const wrap: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '24px 18px 60px', fontFamily: 'system-ui, sans-serif', color: 'var(--ink,#16233a)' };
  const card: React.CSSProperties = { background: 'var(--surface,#fff)', border: '1px solid var(--line,#e4eaf1)', borderRadius: 14, padding: 18, marginBottom: 14 };

  if (!user || user.role !== 'guardian') {
    return (
      <div style={wrap}>
        <h1 style={{ fontSize: 22 }}>야누스 학부모 리포트</h1>
        <p style={{ color: 'var(--muted,#5a6b83)', lineHeight: 1.7 }}>자녀의 주간 통합 리포트는 학부모 계정으로 로그인해야 볼 수 있습니다.</p>
        <Link to="/login" className="btn gold">로그인 →</Link>
      </div>
    );
  }

  async function toggleConsent(next: boolean) {
    if (!sel || consentBusy) return;
    if (!next && !window.confirm('동의를 철회하면 이후 상담의 AI 요약 리포트가 제공되지 않습니다(녹음 자체는 상담 당사자 동의 체계를 따릅니다). 철회할까요?')) return;
    setConsentBusy(true);
    try {
      await api.post('/media/guardian-consent', { studentId: sel, granted: next });
      const r = await api.get<{ granted: boolean; grantedAt: string | null; retentionDays: number }>(`/media/guardian-consent/${encodeURIComponent(sel)}`);
      setConsent(r);
    } catch { /* 실패 시 상태 유지 */ } finally { setConsentBusy(false); }
  }

  const a = report?.sections.attendance;

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <JanusLogo size={24} />
        <h1 style={{ fontSize: 21, margin: 0 }}>주간 통합 리포트</h1>
      </div>
      <p style={{ color: 'var(--muted,#5a6b83)', fontSize: 13, margin: '0 0 18px' }}>자녀의 성적·출석·상담·Q&A를 한눈에. 최근 7일 기준.</p>

      {/* 자녀 선택 */}
      {children && children.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {children.map((c) => (
            <button key={c.studentId} onClick={() => setSel(c.studentId)} className={sel === c.studentId ? 'btn sm' : 'btn ghost sm'}>{c.name}</button>
          ))}
        </div>
      )}
      {children && children.length === 0 && (
        <div style={card}>연결된 자녀가 없습니다. 앱에서 자녀 연결을 먼저 진행해 주세요.</div>
      )}
      {err && <div style={{ ...card, background: '#fbeae7', border: '1px solid #f0cfc9', color: '#a64b37' }}>{err}</div>}

      {report && (
        <>
          <div style={{ ...card, background: 'var(--j-blue-soft,#eef4fb)', border: 'none' }}>
            <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.5 }}>{report.headline}</div>
          </div>

          {/* 성적 */}
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginBottom: 8 }}>성적 · 배치</div>
            {report.sections.score ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                {report.sections.score.nb != null && <span style={{ fontSize: 26, fontWeight: 800, fontFamily: 'ui-monospace,monospace', color: 'var(--teal,#2f6fb3)' }}>{report.sections.score.nb}%</span>}
                <span style={{ fontSize: 13.5 }}>{report.sections.score.label}</span>
              </div>
            ) : <div style={{ color: 'var(--muted)', fontSize: 13 }}>연동된 성적이 없습니다.</div>}
          </div>

          {/* 성적·배치 추이 — 노출 정책(showTrend) 게이팅 */}
          {access?.showTrend && trend && trend.points.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginBottom: 10 }}>성적·배치 추이</div>
              <ScoreTrend trend={trend} showPlacement={!!access.showPlacement} />
            </div>
          )}

          {/* 출석 */}
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginBottom: 10 }}>세션 · 출석</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: a && a.rate != null ? (a.rate === 100 ? '#2A8A5F' : a.rate >= 80 ? '#2F6FB3' : '#CF9A3A') : 'var(--muted)' }}>
                {a && a.rate != null ? `${a.rate}%` : '—'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{a?.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['완료', a?.done, '#2A8A5F'], ['예정', a?.upcoming, '#2F6FB3'], ['노쇼', a?.noshow, '#E5484D'], ['취소', a?.cancelled, '#8695a8']].map(([label, n, c]) => (
                <span key={label as string} style={{ fontSize: 12, background: 'var(--surface-2,#f4f7fb)', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 10px' }}>
                  <b style={{ color: c as string }}>{(n as number) ?? 0}</b> {label as string}
                </span>
              ))}
            </div>
          </div>

          {/* 상담 기록 상세 — 공개(final·보호자 공개) 노트의 핵심요약·과제·방향 */}
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginBottom: 10 }}>
              상담 기록{notes != null ? ` · ${notes.length}건` : report.sections.consultation.count ? ` · ${report.sections.consultation.count}건` : ''}
            </div>
            {notes === null ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>불러오는 중…</div>
            ) : notes.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>공개된 상담 기록이 없습니다.</div>
            ) : notes.slice(0, 6).map((n, i) => (
              <div key={n.bookingId} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
                  {KST(n.createdAt)}{n.teacherName ? ` · ${n.teacherName} 선생님` : ''}{n.consultType ? ` · ${n.consultType}` : ''}
                </div>
                {n.coreSummary && <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.coreSummary}</div>}
                {n.homework && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}><b style={{ color: 'var(--ink)' }}>과제</b> · {n.homework}</div>}
                {n.futureDir && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}><b style={{ color: 'var(--ink)' }}>방향</b> · {n.futureDir}</div>}
                {!n.coreSummary && !n.homework && !n.futureDir && <div style={{ fontSize: 13, color: 'var(--muted)' }}>요약 없음</div>}
              </div>
            ))}
          </div>

          {/* Q&A */}
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>Q&A 활동</div>
            <div style={{ fontSize: 13.5 }}>이번 주 질문 <b>{report.sections.qna.count}</b>건</div>
          </div>

          <p style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'center', marginTop: 18 }}>{report.disclaimer}</p>
        </>
      )}
      {!report && !err && children !== null && children.length > 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>리포트를 불러오는 중…</div>
      )}
      {/* 상담 녹음·AI 요약 보호자 동의(본부 결정) — 미성년 음성의 외부 STT 처리는 동의 자녀 한정 */}
      {consent !== null && (
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <b style={{ fontSize: 14.5 }}>🎙 상담 녹음·AI 요약 동의</b>
              <div style={{ fontSize: 12.5, color: 'var(--muted,#5a6b83)', lineHeight: 1.6, marginTop: 4 }}>
                동의하시면 자녀의 1:1 상담 음성이 요약 리포트 생성을 위해 녹음·문자화(외부 AI 처리 포함)됩니다.
                영상은 저장되지 않으며, 음성 원본은 {consent.retentionDays}일 후 자동 파기됩니다. 언제든 철회할 수 있어요.
                {consent.granted && consent.grantedAt && <> · 동의일 {new Date(consent.grantedAt).toLocaleDateString('ko-KR')}</>}
              </div>
            </div>
            <button className={consent.granted ? 'btn ghost' : 'btn gold'} disabled={consentBusy} onClick={() => toggleConsent(!consent.granted)}
              style={{ minWidth: 110 }}>
              {consentBusy ? '처리 중…' : consent.granted ? '동의 철회' : '동의하기'}
            </button>
          </div>
        </div>
      )}

      {/* 자녀 격차 리포트 이력(O104·O105) — 열람은 연령별 동의 게이트를 통과해야 한다. */}
      {sel && (
        <div style={{ background: 'var(--surface,#fff)', border: '1px solid var(--line,#e4eaf1)', borderRadius: 14, padding: 18, marginTop: 16 }}>
          <b style={{ fontSize: 14.5 }}>자녀 격차 리포트 이력</b>
          {gapGate ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted,#5a6b83)', lineHeight: 1.7, marginTop: 6 }}>
              {gapGate}
              <div style={{ marginTop: 4 }}>
                미성년 자녀는 <b>본인확인·데이터 전달 동의</b>를 완료하면 열람할 수 있고(동의·본인확인 메뉴),
                성인 자녀는 <b>자녀 본인이 공유에 동의</b>해야 열람할 수 있어요.
              </div>
            </div>
          ) : gapHist === null ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted,#5a6b83)', marginTop: 6 }}>불러오는 중…</div>
          ) : gapHist.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted,#5a6b83)', marginTop: 6 }}>아직 생성된 격차 리포트가 없어요.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {gapHist.map((h) => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--line,#e4eaf1)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted,#5a6b83)', minWidth: 62 }}>
                    {new Date(h.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: HIST_BAND_COLOR[h.payload.gap.band] ?? 'var(--ink)' }}>{h.payload.gap.band}</span>
                  <span style={{ fontSize: 13, flex: 1, minWidth: 150 }}>
                    {h.payload.target.univ} {h.payload.target.dept} · 컷 {h.payload.target.cut}{h.payload.unit.suffix}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted,#5a6b83)' }}>
                    {h.payload.unit.label} {h.payload.generatedFor.value}{h.payload.unit.suffix}
                    {h.payload.gap.shortfall > 0 ? ` · ${h.payload.gap.shortfall} 부족` : ' · 도달'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
