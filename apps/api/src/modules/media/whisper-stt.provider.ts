import { Injectable, Logger } from '@nestjs/common';
import type { SttInput, SttProvider, SttResult } from './stt.types';

/**
 * OpenAI Whisper 계열 STT (STT_PROVIDER=whisper). OPENAI_API_KEY 필요.
 * 모델은 STT_WHISPER_MODEL(기본 whisper-1). egress ogg 는 그대로 업로드 가능.
 * ⚠ 미성년 음성 외부 전송 — 반드시 sttAllowed(보호자 동의) 게이트 뒤에서만 호출.
 */
@Injectable()
export class WhisperSttProvider implements SttProvider {
  private readonly logger = new Logger('Stt:whisper');

  constructor(
    private readonly apiKey: string,
    private readonly model = 'whisper-1',
  ) {}

  async transcribe(input: SttInput): Promise<SttResult> {
    const form = new FormData();
    const mime = input.mime ?? 'audio/ogg';
    const ext = mime.includes('ogg')
      ? 'ogg'
      : mime.includes('webm')
        ? 'webm'
        : mime.includes('mp4')
          ? 'mp4'
          : 'mp3';
    form.append(
      'file',
      new Blob([new Uint8Array(input.audio)], { type: mime }),
      `audio.${ext}`,
    );
    form.append('model', this.model);
    form.append('language', input.lang ?? 'ko');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`whisper 실패 ${res.status}: ${body.slice(0, 200)}`);
      throw new Error(`STT 실패(${res.status})`);
    }
    const j = (await res.json()) as { text?: string };
    return {
      text: j.text ?? '',
      engine: `whisper:${this.model}`,
      lang: input.lang ?? 'ko',
    };
  }
}
