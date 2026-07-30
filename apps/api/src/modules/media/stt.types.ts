/**
 * SttProvider 어댑터 (R2 — 브리핑 §3 STT). 엔진은 ENV STT_PROVIDER 로 교체(본부 확정 전 mock 기본).
 * 외부 위탁 적합성(미성년 음성)은 보호자 동의(sttAllowed) 게이트 뒤에서만 호출된다 — 호출측 책임.
 */
export const STT_PROVIDER = Symbol('STT_PROVIDER');

export interface SttInput {
  audio: Buffer;
  mime?: string; // audio/ogg 등 — egress 산출물 기준
  lang?: string; // 기본 ko
  /**
   * 녹음 길이(초). 과금이 길이 비례라 **분 단위 상한**의 입력이 된다(QuotaSttProvider).
   * 없으면 바이트 수로 추정하므로, 아는 값이면 반드시 넘길 것.
   */
  durationSec?: number | null;
}

export interface SttResult {
  text: string;
  engine: string; // 'mock' | 'whisper' | 'clova' ... — consult_transcript.engine 에 기록
  lang: string;
  demo?: boolean; // mock 산출물 표시(검수 UI 에서 경고)
}

export interface SttProvider {
  transcribe(input: SttInput): Promise<SttResult>;
}
