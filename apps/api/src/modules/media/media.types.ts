// 미디어(SFU) 어댑터 — 강의 음성/영상(선생님→학생 단방향) + 녹화. CLAUDE.md §10 패턴.
// 현재 MockMediaProvider(플레이스홀더). 실 SFU(LiveKit·mediasoup)는 이 인터페이스로 교체.
export const MEDIA_PROVIDER = Symbol('MEDIA_PROVIDER');

export type MediaRole = 'publisher' | 'subscriber';

export interface MediaTokenResult {
  provider: string;
  url: string | null; // SFU 접속 URL(미설정 시 null)
  token: string | null; // 접속 토큰(미설정 시 null)
  role: MediaRole;
  note?: string;
}

export interface MediaProvider {
  /** 접속 토큰 — 선생님=publisher(송출), 학생=subscriber(수신). */
  issueToken(
    roomRef: string,
    identity: string,
    role: MediaRole,
    displayName?: string,
  ): Promise<MediaTokenResult>;
  /** 서버측 녹화 시작(SFU egress). 반환 recordingRef 로 종료. opts.pathPrefix 로 저장 경로 분기(기본 lectures). */
  startRecording(
    roomRef: string,
    opts?: { pathPrefix?: string },
  ): Promise<{ provider: string; recordingRef: string }>;
  /** 녹화 종료 → 산출물 URL(가능 시). */
  stopRecording(
    roomRef: string,
    recordingRef: string,
  ): Promise<{ url: string | null; durationSec?: number }>;
  /** 룸 종료(미디어 정리). */
  closeRoom(roomRef: string): Promise<void>;
}
