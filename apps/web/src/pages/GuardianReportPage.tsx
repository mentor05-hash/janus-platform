import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { JanusLogo } from '../components/JanusLogo';

/** 학부모 주간 통합 리포트 — 자녀 성적·출석·상담·Q&A 요약(야누스에서만 생성). */
type Child = { id: string; name: string };
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
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'guardian') return;
    api.get<{ children: Child[] }>('/guardian/children')
      .then((r) => { setChildren(r.children); if (r.children[0]) setSel(r.children[0].id); })
      .catch(() => setChildren([]));
  }, [user]);

  useEffect(() => {
    if (!sel) return;
    setReport(null); setErr(null);
    api.get<Report>(`/guardian/report?studentId=${encodeURIComponent(sel)}`)
      .then(setReport)
      .catch((e) => setErr(e?.message ?? '리포트를 불러오지 못했습니다.'));
  }, [sel]);

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
            <button key={c.id} onClick={() => setSel(c.id)} className={sel === c.id ? 'btn sm' : 'btn ghost sm'}>{c.name}</button>
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

          {/* 상담 */}
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginBottom: 10 }}>상담 기록 · {report.sections.consultation.count}건</div>
            {report.sections.consultation.recent.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>이번 주 상담 기록이 없습니다.</div>
            ) : report.sections.consultation.recent.map((n, i) => (
              <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 2 }}>{KST(n.at)}{n.teacher ? ` · ${n.teacher} 선생님` : ''}</div>
                <div style={{ fontSize: 13.5 }}>{n.summary ?? '요약 없음'}</div>
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
    </div>
  );
}
