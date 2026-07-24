import { useEffect, useMemo, useState } from 'react';
import { tokens } from '../api/client';
import { ChatPanel } from '../components/ChatPanel';
import { WhiteboardPanel } from '../components/WhiteboardPanel';

/**
 * 네이티브 WebView 임베드용 몰입형 세션 페이지(§하이브리드).
 * SessionWebView 가 `${webOrigin}/embed/session?booking=&kind=` 로 로드하며,
 * 접근 토큰은 injectedJavaScriptBeforeContentLoaded 로 `window.__JANUS_TOKEN` 주입
 * (또는 ?token= 쿼리). 앱 셸/로그인 없이 세션만 전체화면 렌더.
 * __ITALL_* 는 구 모바일 빌드 하위호환용 폴백(신규는 __JANUS_*).
 */
declare global {
  interface Window {
    __JANUS_TOKEN?: string;
    __JANUS_REFRESH?: string;
    __ITALL_TOKEN?: string; // 하위호환(구 모바일 주입)
    __ITALL_REFRESH?: string;
    ReactNativeWebView?: { postMessage: (m: string) => void };
  }
}

function jwtSub(token: string | null): string {
  if (!token) return '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub ?? '';
  } catch {
    return '';
  }
}

export function EmbedSessionPage() {
  const q = new URLSearchParams(window.location.search);
  const bookingId = q.get('booking') ?? '';
  const kind = (q.get('kind') ?? 'chat') as 'chat' | 'whiteboard' | 'both';
  const title = q.get('title') ?? '상담';

  const [ready, setReady] = useState(false);
  useEffect(() => {
    // 토큰 주입: WebView 전역 → fragment(#) → 쿼리 순. 세션 동안만 사용.
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const access = window.__JANUS_TOKEN || window.__ITALL_TOKEN || h.get('token') || q.get('token') || tokens.access;
    const refresh = window.__JANUS_REFRESH || window.__ITALL_REFRESH || h.get('refresh') || q.get('refresh') || access;
    if (access) tokens.set(access, refresh || access);
    // URL 로 토큰이 실려 왔다면 히스토리에서 제거(주소창·Referer 노출 회피). booking/kind/title 은 유지.
    if (window.location.hash || q.has('token') || q.has('refresh')) {
      const clean = new URLSearchParams(window.location.search);
      clean.delete('token'); clean.delete('refresh');
      const qs = clean.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myId = useMemo(() => jwtSub(tokens.access), [ready]);
  const close = () => window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'session:close' }));

  if (!bookingId) return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>booking 파라미터가 필요합니다.</div>;
  if (!ready) return <div style={{ padding: 24 }} />;

  const wide = window.innerWidth >= 900 && kind === 'both';
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#EEF2F8', display: 'flex' }}>
      {kind === 'whiteboard' ? (
        <WhiteboardPanel bookingId={bookingId} title={title} onClose={close} />
      ) : kind === 'both' && wide ? (
        <>
          <div style={{ flex: 1, borderRight: '1px solid #E4EAF1' }}><ChatPanel bookingId={bookingId} myId={myId} title={title} onClose={close} /></div>
          <div style={{ flex: 1 }}><WhiteboardPanel bookingId={bookingId} title={title} onClose={close} /></div>
        </>
      ) : (
        <ChatPanel bookingId={bookingId} myId={myId} title={title} onClose={close} />
      )}
    </div>
  );
}
