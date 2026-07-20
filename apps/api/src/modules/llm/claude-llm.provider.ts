import { Logger } from '@nestjs/common';
import {
  AnswerSimilarityInput,
  AnswerSimilarityResult,
  ConsultingAnalysisInput,
  ConsultingAnalysisResult,
  ConsultSummaryInput,
  ConsultSummaryResult,
  GatewayInterpretInput,
  GatewayLlmResult,
  LlmProvider,
  QnaDraftInput,
  QnaDraftResult,
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

  /** Claude 텍스트 호출 → JSON 파싱(마크다운 펜스 제거). 키 없으면 예외. */
  private async completeJson<T>(prompt: string, maxTokens = 800): Promise<T> {
    if (!this.apiKey) throw new Error('실모델 AI 가 아직 구성되지 않았습니다(ANTHROPIC_API_KEY 필요).');
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Claude API 오류 ${res.status}: ${body.slice(0, 200)}`);
    }
    const j = (await res.json()) as { content?: { text?: string }[] };
    const raw = (j.content?.[0]?.text ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return JSON.parse(raw) as T;
  }

  /** 신고 사유를 실모델로 1차 분류(위험도·분류·조치 제안). */
  async reviewReport(input: ReportReviewInput): Promise<ReportReviewResult> {
    const prompt =
      '너는 교육 플랫폼 신고 1차 검토자다. 아래 신고를 검토해 **JSON만** 출력(설명 금지).\n' +
      '형식: {"flagged":true|false,"severity":"none|low|high","category":"욕설|성희롱|사기|스팸|기타(있으면)","summary":"한줄 요약","suggestedAction":"none|warn|suspend"}\n' +
      `대상유형: ${input.targetType}\n신고사유: ${input.reason}`;
    try {
      const r = await this.completeJson<ReportReviewResult>(prompt);
      return {
        flagged: !!r.flagged,
        severity: (['none', 'low', 'high'] as const).includes(r.severity) ? r.severity : 'low',
        category: r.category,
        summary: r.summary ?? '검토 요약 없음',
        suggestedAction: r.suggestedAction ?? 'none',
      };
    } catch (e) {
      this.logger.warn(`신고 검토 실패, 보류 처리: ${(e as Error).message}`);
      return { flagged: false, severity: 'none', summary: '자동 검토 실패 — 관리자 수동 확인 필요', suggestedAction: 'none' };
    }
  }

  /** 새 답변이 기존 답변들과 얼마나 유사한지 실모델로 판정(표절·중복 탐지). */
  async checkAnswerSimilarity(input: AnswerSimilarityInput): Promise<AnswerSimilarityResult> {
    if (!input.priors?.length) return { flagged: false, maxSimilarity: 0, summary: '비교 대상 없음' };
    const priorList = input.priors.slice(0, 20).map((p, i) => `[${i}] id=${p.id}: ${p.body.slice(0, 500)}`).join('\n');
    const prompt =
      '아래 새 답변이 기존 답변들과 얼마나 유사한지 0~1 로 평가하고 **JSON만** 출력.\n' +
      '형식: {"maxSimilarity":0~1,"similarIndex":정수 또는 -1,"flagged":true|false(0.8이상이면 true),"summary":"한줄"}\n' +
      `새 답변: ${input.body.slice(0, 1000)}\n\n기존 답변들:\n${priorList}`;
    try {
      const r = await this.completeJson<{ maxSimilarity: number; similarIndex: number; flagged: boolean; summary: string }>(prompt);
      const sim = Math.max(0, Math.min(1, Number(r.maxSimilarity) || 0));
      const idx = Number(r.similarIndex);
      return {
        flagged: !!r.flagged || sim >= 0.8,
        maxSimilarity: sim,
        similarToId: idx >= 0 ? input.priors[idx]?.id : undefined,
        summary: r.summary ?? '',
      };
    } catch (e) {
      this.logger.warn(`유사도 검사 실패: ${(e as Error).message}`);
      return { flagged: false, maxSimilarity: 0, summary: '자동 유사도 검사 실패' };
    }
  }

  /**
   * 상담 전사문 → 요약 리포트 초안(R3). 가드레일(브리핑 §4):
   * 전사문에 있는 사실만 사용(창작·과장 금지), 개인 식별정보(이름·연락처·학교명) 미기재,
   * 진단은 관찰 근거와 함께, 학생·학부모가 읽는 문서이므로 존중하는 어조.
   */
  async consultSummary(input: ConsultSummaryInput): Promise<ConsultSummaryResult> {
    const prompt =
      '너는 교육 플랫폼의 상담 요약 작성자다. 아래 상담 전사문을 요약해 **JSON만** 출력(설명 금지).\n' +
      '가드레일(위반 금지): ①전사문에 실제로 언급된 내용만 쓴다 — 없는 사실 창작·추정 금지 ②이름·연락처·학교명 등 개인 식별정보를 쓰지 않는다(호칭은 "학생"/"선생님") ' +
      '③진단(diagnosis)은 전사문의 관찰 근거를 함께 언급한다 ④학생·학부모가 읽는 문서다 — 존중하는 어조, 낙인 표현 금지 ⑤확실하지 않으면 항목을 비워라.\n' +
      '형식: {"covered":["다룬 내용 3~6개"],"diagnosis":"진단·관찰 2~4문장","nextActions":["다음 액션 2~5개"]}\n' +
      (input.subject ? `상담 분야: ${input.subject}\n` : '') +
      (input.durationSec ? `상담 길이: 약 ${Math.round(input.durationSec / 60)}분\n` : '') +
      (input.scoreHint ? `참고(성적 요지, 읽기 전용): ${input.scoreHint}\n` : '') +
      `전사문:\n${input.transcript.slice(0, 12000)}`;
    const r = await this.completeJson<ConsultSummaryResult>(prompt, 1200);
    const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max) : []);
    return { covered: arr(r.covered, 6), diagnosis: (r.diagnosis ?? '').trim(), nextActions: arr(r.nextActions, 5) };
  }

  async draftAnswer(input: QnaDraftInput): Promise<QnaDraftResult> {
    const prompt =
      '너는 입시 학습 Q&A 의 조교다. 아래 학생 질문에 대한 **1차 초안 답변**을 한국어로 작성하되, ' +
      '단정적 정답 대신 풀이 방향·단계·확인 포인트 중심으로 쓰고, 심리·건강 관련이면 전문가 상담을 권하는 문장을 포함한다. ' +
      '**JSON만** 출력: {"body":"초안(400자 이내)"}\n' +
      `과목: ${input.subject ?? '미지정'} · 난이도: ${input.difficulty ?? '미지정'}\n질문: ${input.body.slice(0, 1200)}`;
    const r = await this.completeJson<{ body?: string }>(prompt, 600);
    const body = (r.body ?? '').trim();
    if (!body) throw new Error('빈 초안');
    return { body };
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

  /** 관문 자유서술 해석(W2 D5) — 마스킹된 입력만 투입. 실패 시 예외 → gateway 규칙 폴백. */
  async interpretGateway(input: GatewayInterpretInput): Promise<GatewayLlmResult> {
    const prompt =
      '너는 입시 전환 관문 플랫폼 "야누스"의 안내자다. 학생/학부모의 자유서술 한 줄을 읽고 ' +
      '가장 맞는 다음 문(서비스)을 고른다. 단정·공포 조장 금지, 차분한 톤. **JSON만** 출력(설명·마크다운 금지).\n' +
      '의도(intent) 중 택1: diagnosis(배치표·격차 진단)|qna(문제 질문)|consulting(입시 전략 상담)|tutoring(1:1 과외)|lecture(강의)|mental(불안·컨디션)|unknown\n' +
      '카드(cards) 1~3장, 각 카드의 to 는 다음 중에서만: /placement, /student/qna, /consulting/apply, /student/search, /services/lecture, /services\n' +
      '형식: {"intent":"...","summary":"입력을 되짚는 한 줄(단정 금지)","cards":[{"title":"...","desc":"...","service":"...","to":"..."}]}\n' +
      `입력: ${input.text.slice(0, 300)}`;
    return this.completeJson<GatewayLlmResult>(prompt, 600);
  }

  // 컨설팅 분석 초안 — 식별정보 없는 메타·서류 목록만 투입. 미설정/오류 시 안전 기본값.
  async analyzeConsulting(input: ConsultingAnalysisInput): Promise<ConsultingAnalysisResult> {
    const fallback = (model: string): ConsultingAnalysisResult => ({
      summary: { strengths: [], concerns: [], highlights: [`제출 자료 ${input.documents.length}건`] },
      diagnostic: { fit_directions: [], activity_suggestions: [], target_gap: '' },
      document_check: { missing: [], inconsistencies: [], requests: [] },
      model,
    });
    if (!this.apiKey) return fallback('claude:unconfigured');
    const prompt =
      '당신은 대입 컨설팅 보조입니다. 아래는 식별정보가 제거된 신청 메타와 제출 서류 목록입니다. ' +
      '컨설턴트가 상담 전에 참고할 "초안"을 아래 JSON 스키마로만(설명 없이) 출력하세요.\n' +
      `학년: ${input.grade}\n관심: ${input.interest}\n상품: ${input.package}\n` +
      `서류: ${input.documents.map((d) => `${d.type}(${d.name})`).join(', ') || '없음'}\n` +
      '스키마: {"summary":{"strengths":[],"concerns":[],"highlights":[]},' +
      '"diagnostic":{"fit_directions":[],"activity_suggestions":[],"target_gap":""},' +
      '"document_check":{"missing":[],"inconsistencies":[],"requests":[]}}';
    try {
      const r = await this.completeJson<Omit<ConsultingAnalysisResult, 'model'>>(prompt, 900);
      return { ...r, model: this.model };
    } catch (e) {
      this.logger.warn(`analyzeConsulting 실패: ${(e as Error).message}`);
      return fallback('claude:error');
    }
  }
}
