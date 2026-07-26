import { Controller, Get, Inject } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { LLM_PROVIDER } from '../../modules/llm/llm.types';
import type { LlmProvider } from '../../modules/llm/llm.types';
import { MEDIA_PROVIDER } from '../../modules/media/media.types';
import type { MediaProvider } from '../../modules/media/media.types';

/** usage() 는 유료 어댑터를 감싼 Quota* 구현에만 있다(mock 은 비용 0이라 감싸지 않음). */
type WithUsage = { usage(): Promise<unknown> };
const hasUsage = (p: unknown): p is WithUsage =>
  typeof (p as WithUsage | null)?.usage === 'function';

/**
 * 유료 외부 API 오늘 사용량 — 상한을 걸어놨어도 눈으로 확인할 경로가 없으면 운영이 안 된다.
 * (실행계획서 §비용: 상한/알람 설정 후 공개). 상한 미적용(mock) 이면 capped=false 로 알린다.
 */
@Controller('admin/usage')
@Roles('admin')
export class QuotaUsageController {
  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
  ) {}

  @Get()
  async today() {
    return {
      llm: hasUsage(this.llm) ? { capped: true, ...(await this.llm.usage() as object) } : { capped: false, note: 'mock 어댑터 — 비용 없음' },
      media: hasUsage(this.media) ? { capped: true, ...(await this.media.usage() as object) } : { capped: false, note: 'mock 어댑터 — 비용 없음' },
    };
  }
}
