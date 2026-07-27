import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 전역 렌더 예외 방어막. lazy 청크 로드 실패·컴포넌트 throw 시 흰 화면 대신 복구 UI 를 보여준다.
 * (이벤트 핸들러·async 에러는 잡지 못함 — 그건 각 화면의 try/catch·failed 플래그 몫.)
 */
interface Props {
  children: ReactNode;
  /** 라우트 등 키가 바뀌면 경계를 리셋(에러 후 페이지 이동 시 자동 복구). */
  resetKey?: unknown;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // resetKey 변경 시(예: 경로 이동) 에러 상태 해제 → 다음 화면 정상 렌더 시도.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 운영 관측 훅(추후 Sentry 등). 지금은 콘솔로 남긴다.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const isChunk = /Loading chunk|dynamically imported module|Failed to fetch/i.test(this.state.error.message);
    return (
      <div
        role="alert"
        style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40 }}>{isChunk ? '🔄' : '⚠️'}</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>
          {isChunk ? '새 버전이 배포되었어요' : '화면을 표시하지 못했어요'}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: 360, lineHeight: 1.6 }}>
          {isChunk
            ? '앱이 업데이트되어 이 페이지를 다시 불러와야 해요. 새로고침하면 최신 화면으로 이어집니다.'
            : '일시적인 문제로 이 화면을 그리지 못했어요. 새로고침하거나 잠시 후 다시 시도해 주세요.'}
        </div>
        <button className="btn" onClick={() => window.location.reload()} data-janus-cta="error-reload">
          새로고침
        </button>
      </div>
    );
  }
}
