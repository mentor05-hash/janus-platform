/**
 * 미디어킷 타입(M-계약) — 소비자(상담·강의·클리닉·외부)는 이 계약만 알면 된다.
 *  M1 토큰: 소비자가 컨텍스트별 발급 API(예: POST /media/token {context,refId})를 호출해 MediaToken 을 얻는다.
 *  M3 계측: 패키지는 앱에 무의존 — 계측·로깅은 onEvent 콜백으로 소비자가 처리한다.
 */
export type MediaStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export type MediaEvent = 'join_attempt' | 'connected' | 'reconnecting' | 'failed' | 'left';

export interface MediaToken {
  url: string; // LiveKit 접속 URL(wss://…)
  token: string; // LiveKit 액세스 토큰(JWT)
}

export interface MediaSessionOptions {
  /** 토큰 발급 — null 반환 = 미개통/권한 없음(join 실패 처리). */
  getToken: () => Promise<MediaToken | null>;
  /** 카메라 사용(기본 false = 음성 전용). 켜면 join 시 카메라 publish + 로컬 미리보기. */
  video?: boolean;
  /** 계측·로깅 훅(선택) — 실패 사유는 meta.message 로 전달. */
  onEvent?: (ev: MediaEvent, meta?: Record<string, unknown>) => void;
}
