import { Injectable, Logger } from '@nestjs/common';
import type { SttInput, SttProvider, SttResult } from './stt.types';

/** 엔진 미확정(본부)·자격증명 미설정 시 폴백 — 파이프라인 구조 검증용 데모 전사문. */
@Injectable()
export class MockSttProvider implements SttProvider {
  private readonly logger = new Logger('Stt:mock');

  async transcribe(input: SttInput): Promise<SttResult> {
    this.logger.log(`mock 전사(데모) — ${input.audio.length} bytes`);
    return {
      engine: 'mock',
      lang: input.lang ?? 'ko',
      demo: true,
      text:
        '[데모 전사문 — STT 엔진 미연동] 실제 상담 음성이 전사되지 않았습니다. ' +
        'STT_PROVIDER 설정(본부 엔진 확정) 후 실전사가 생성됩니다. 검수 시 이 초안은 참고용으로만 사용하세요.',
    };
  }
}
