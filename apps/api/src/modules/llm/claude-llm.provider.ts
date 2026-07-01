import { Logger } from '@nestjs/common';
import {
  AnswerSimilarityInput,
  AnswerSimilarityResult,
  LlmProvider,
  ReportReviewInput,
  ReportReviewResult,
  ScoreOcrInput,
  ScoreOcrItem,
  ScoreOcrResult,
} from './llm.types';

/**
 * 실모델(Claude) LlmProvider (§9·§10). ANTHROPIC_API_KEY 설정 시 실동작.
 * 신고 검토·유사도는 아직 stub(요청 시 확장), 성적표 OCR 은 비전 API 로 실구현.
 */
export class ClaudeLlmProvider implements LlmProvider {
  private readonly logger = new Logger('LlmProvider:claude');
  private readonly endpoint = 'https://api.anthropic.com/v1/messages';

  constructor(
    private readonly apiKey?: string,
    private readonly model: string = 'claude-sonnet-4-6',
  ) {
    if (!apiKey) this.logger.warn('ClaudeLlmProvider 자격증명 미구성(ANTHROPIC_API_KEY). OCR 은 키 설정 시 동작합니다.');
  }

  reviewReport(_input: ReportReviewInput): Promise<ReportReviewResult> {
    throw new Error('실모델 AI 검토가 아직 구성되지 않았습니다(ANTHROPIC_API_KEY 필요).');
  }

  checkAnswerSimilarity(_input: AnswerSimilarityInput): Promise<AnswerSimilarityResult> {
    throw new Error('실모델 유사도 검사가 아직 구성되지 않았습니다(ANTHROPIC_API_KEY 필요).');
  }

  /** 성적표 이미지 → Claude 비전으로 과목·점수를 구조화 추출. */
  async extractScoreReport(input: ScoreOcrInput): Promise<ScoreOcrResult> {
    if (!this.apiKey) {
      throw new Error('실 비전 OCR 이 아직 구성되지 않았습니다(ANTHROPIC_API_KEY 필요).');
    }
    const media = /png|jpe?g|webp|gif/.test(input.mimeType) ? input.mimeType : 'image/png';
    const prompt =
      '이 이미지는 학생 성적표입니다. 표에서 과목명과 점수를 추출해 **JSON만** 출력하세요(설명·마크다운 금지).\n' +
      '형식: {"period":"기간(있으면)","examType":"시험유형(있으면)","items":[{"subject":"국어","score":90,"maxScore":100,"grade":"등급(있으면)"}]}\n' +
      '점수를 읽을 수 없으면 score 는 null. 만점 정보 없으면 100.';

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: media, data: input.imageBase64 } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Claude 비전 API 오류 ${res.status}: ${body.slice(0, 200)}`);
    }
    const j = (await res.json()) as { content?: { text?: string }[] };
    const raw = (j.content?.[0]?.text ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let parsed: { period?: string; examType?: string; items?: ScoreOcrItem[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('OCR 응답을 해석하지 못했습니다. 수동 입력을 이용하세요.');
    }
    const items = (parsed.items ?? []).map((i) => ({
      subject: String(i.subject ?? '').trim(),
      score: i.score == null ? null : Number(i.score),
      maxScore: i.maxScore == null ? 100 : Number(i.maxScore),
      grade: i.grade ?? null,
    })).filter((i) => i.subject);
    return { demo: false, period: parsed.period, examType: parsed.examType, items, note: '실 비전 모델(Claude)로 추출했습니다. 값을 확인하세요.' };
  }
}
