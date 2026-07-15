/* 계산기 이식 호스트(/kairos·/alea) — 동일 출처 iframe 임베드 + 접합계약 브리지.
 * 계산기 HTML(public/calc/*.html)은 자체완결 코드(저작권 데이터 0, repo 편입).
 * - C2: 부모 AuthContext 가 localStorage.janus_sso 세팅 → iframe 이 읽어 잠금 해제.
 * - C3: iframe 이 dispatch 하는 janus:track 을 부모가 청취 → funnel 계측으로 브리지.
 * - C5: iframe 의 janus_report(결과·근거) 를 부모가 수집(현재는 세션 보관 — 후속 리포트 연동).
 * 같은 출처라 iframe.contentWindow 이벤트 청취가 가능(교차출처면 postMessage 필요).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { JanusLogo } from '../components/JanusLogo';
import { track } from '../utils/track';

export interface CalcSpec {
  slug: 'kairos' | 'alea';
  page: string; // 계측 page id(계산기 배선의 data-janus-page 와 일치)
  title: string;
  tag: string;
  file: string; // public 기준 경로
}

export const CALCULATORS: Record<string, CalcSpec> = {
  kairos: { slug: 'kairos', page: 'kairos', title: '카이로스', tag: '정시 지원분석', file: '/calc/kairos.html' },
  alea: { slug: 'alea', page: 'alea', title: '알레아', tag: '이벤트 확률', file: '/calc/alea.html' },
};

type TrackDetail = { page: string; ev: string };
type ReportDetail = { page: string; result: unknown; evidence?: { relTier?: string; basis?: string } };

export function CalculatorPage({ spec }: { spec: CalcSpec }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [lastReport, setLastReport] = useState<ReportDetail | null>(null);

  // 진입 계측은 부모에서 확정(계산기의 초기 view 이벤트는 iframe load 이전이라 놓칠 수 있음).
  useEffect(() => { track(spec.page, 'view'); }, [spec.page]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let win: Window | null = null;

    const onTrack = (e: Event) => {
      const d = (e as CustomEvent<TrackDetail>).detail;
      if (!d) return;
      // 계산기 ev → funnel 매핑. view 는 부모 마운트에서 이미 계측(중복 방지 위해 여기선 제외).
      if (d.ev === 'consult') track(d.page, 'cta', 'consult-reserve');
      else if (d.ev === 'unlock') track(d.page, 'cta', 'unlock');
    };
    const onReport = (e: Event) => {
      const d = (e as CustomEvent<ReportDetail>).detail;
      if (d) setLastReport(d); // C5: 근거 수집(후속 janus_report 리포트 파이프 연동 지점)
    };

    const attach = () => {
      win = iframe.contentWindow;
      if (!win) return;
      win.addEventListener('janus:track', onTrack as EventListener);
      win.addEventListener('janus_report', onReport as EventListener);
    };
    iframe.addEventListener('load', attach);
    return () => {
      iframe.removeEventListener('load', attach);
      if (win) {
        win.removeEventListener('janus:track', onTrack as EventListener);
        win.removeEventListener('janus_report', onReport as EventListener);
      }
    };
  }, [spec.slug]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', height: 56, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <JanusLogo size={24} />
            <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>야누스</span>
          </Link>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--j-blue)', background: 'var(--j-blue-soft)', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap' }}>{spec.title} · {spec.tag}</span>
          <span style={{ flex: 1 }} />
          {lastReport?.evidence?.relTier && (
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--caption)' }} title={lastReport.evidence.basis}>신뢰도 {lastReport.evidence.relTier}</span>
          )}
          <Link to="/placement/hub" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textDecoration: 'none' }}>배치표 허브</Link>
          <Link id="consult-reserve" to="/consulting/apply" className="btn gold sm" style={{ textDecoration: 'none' }}
            onClick={() => track(spec.page, 'cta', 'consult-reserve')}>1:1 상담 예약</Link>
        </div>
      </header>

      <main style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <iframe
          ref={iframeRef}
          src={spec.file}
          title={spec.title}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#fff' }}
        />
      </main>

      <footer style={{ flexShrink: 0, borderTop: '1px solid var(--line)', background: 'var(--surface)', padding: '7px 16px', fontSize: 11, color: 'var(--caption)', textAlign: 'center' }}>
        ⓘ 모든 수치는 추정치이며 실제 결과를 보장하지 않습니다 · 개인 진학지도용 — 무단 캡처·재배포 금지 · © 2026 야누스 입시연구소
      </footer>
    </div>
  );
}

export function KairosPage() { return <CalculatorPage spec={CALCULATORS.kairos} />; }
export function AleaPage() { return <CalculatorPage spec={CALCULATORS.alea} />; }
