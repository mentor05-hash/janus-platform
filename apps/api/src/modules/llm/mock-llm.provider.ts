import { Injectable, Logger } from '@nestjs/common';
import {
  AnswerSimilarityInput,
  AnswerSimilarityResult,
  ConsultingAnalysisInput,
  ConsultingAnalysisResult,
  GatewayInterpretInput,
  GatewayLlmResult,
  LlmProvider,
  QnaDraftInput,
  QnaDraftResult,
  ReportReviewInput,
  ReportReviewResult,
  ScoreOcrInput,
  ScoreOcrResult,
} from './llm.types';

/**
 * 로컬 stub LLM — 실모델 연동 전 자리표시.
 * - 신고: 키워드 휴리스틱(심각/경미 2단계 + 분류)
 * - 답변 유사도: 토큰 Jaccard(문자 3-gram 병용)로 표절·중복 답변 1차 탐지
 */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  private readonly logger = new Logger('LlmProvider:mock');

  // 심각(정지 권고) / 경미(경고 권고) 키워드
  private static readonly SEVERE: Record<string, string[]> = {
    성희롱: ['성희롱', '성추행', '몸매', '스킨십'],
    폭력: ['폭력', '폭행', '때리', '협박'],
    사기: ['사기', '환불 안', '돈 떼', '입금만'],
    욕설: ['욕설', '폭언', '씨발', '개새'],
  };
  private static readonly MINOR = ['불친절', '지각', '무성의', '연락 두절', '반말'];

  async reviewReport(input: ReportReviewInput): Promise<ReportReviewResult> {
    const text = input.reason ?? '';
    let category: string | undefined;
    for (const [cat, kws] of Object.entries(MockLlmProvider.SEVERE)) {
      if (kws.some((k) => text.includes(k))) { category = cat; break; }
    }
    const minor = !category && MockLlmProvider.MINOR.some((k) => text.includes(k));
    const severity: ReportReviewResult['severity'] = category ? 'high' : minor ? 'low' : 'none';
    this.logger.log(`[stub] review target=${input.targetType} severity=${severity} category=${category ?? '-'}`);
    return {
      flagged: severity !== 'none',
      severity,
      category,
      summary:
        severity === 'high' ? `자동 검토: ${category} 위반 소지(관리자 즉시 확인 필요)`
        : severity === 'low' ? '자동 검토: 경미 사안(경고 검토)'
        : '자동 검토: 특이사항 없음',
      suggestedAction: severity === 'high' ? 'suspend' : severity === 'low' ? 'warn' : 'none',
    };
  }

  async checkAnswerSimilarity(input: AnswerSimilarityInput): Promise<AnswerSimilarityResult> {
    const a = MockLlmProvider.norm(input.body);
    let best = 0, bestId: string | undefined;
    for (const p of input.priors) {
      const sim = MockLlmProvider.similarity(a, MockLlmProvider.norm(p.body));
      if (sim > best) { best = sim; bestId = p.id; }
    }
    const flagged = best >= 0.6; // 60%↑ 유사 → 중복/표절 소지
    this.logger.log(`[stub] similarity max=${best.toFixed(2)} flagged=${flagged}`);
    return {
      flagged,
      maxSimilarity: Math.round(best * 100) / 100,
      similarToId: flagged ? bestId : undefined,
      summary: flagged
        ? `기존 답변과 ${Math.round(best * 100)}% 유사 — 중복/표절 여부 확인 권장`
        : '유사 답변 없음',
    };
  }

  async draftAnswer(input: QnaDraftInput): Promise<QnaDraftResult> {
    const subj = input.subject ? `[${input.subject}] ` : '';
    const q = (input.body ?? '').trim().slice(0, 60);
    this.logger.log('[stub] draftAnswer');
    return {
      body:
        `${subj}질문 요지: ${q}${q.length >= 60 ? '…' : ''}\n\n` +
        '① 먼저 개념/정의를 확인해 보세요. ② 문제의 조건을 하나씩 대입해 단계적으로 풀어보고, ③ 막히는 지점을 구체적으로 남겨 주시면 선생님이 이어서 보완해 드립니다.\n' +
        '(이 초안은 AI가 생성한 참고용이며, 선생님 검토 후 정답이 확정됩니다.)',
    };
  }

  async extractScoreReport(input: ScoreOcrInput): Promise<ScoreOcrResult> {
    // 데모: 실 비전 인식은 LLM_PROVIDER=claude 연동 필요. 흐름 시연용 표준 과목 프리필.
    this.logger.log(`[stub] 성적표 OCR(데모) mime=${input.mimeType} bytes≈${Math.round((input.imageBase64?.length ?? 0) * 0.75)}`);
    return {
      demo: true,
      period: '',
      examType: '',
      items: [
        { subject: '국어', score: null, maxScore: 100, grade: null },
        { subject: '수학', score: null, maxScore: 100, grade: null },
        { subject: '영어', score: null, maxScore: 100, grade: null },
        { subject: '과학', score: null, maxScore: 100, grade: null },
        { subject: '사회', score: null, maxScore: 100, grade: null },
      ],
      note: '데모 OCR: 실제 성적표 인식은 비전 모델(LLM_PROVIDER=claude) 연동이 필요합니다. 과목 틀만 채웠으니 점수를 확인·입력하세요.',
    };
  }

  /** 관문 해석(stub) — 실모델 미구성 신호로 예외를 던진다 → gateway 가 규칙 폴백을 사용(중복 규칙 구현 방지). */
  async interpretGateway(_input: GatewayInterpretInput): Promise<GatewayLlmResult> {
    throw new Error('mock LLM 은 관문 해석을 지원하지 않습니다 — 규칙 폴백을 사용하세요.');
  }

  private static norm(s: string): string {
    return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  // 단어 Jaccard와 문자 3-gram Jaccard의 평균
  private static similarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const wj = MockLlmProvider.jaccard(new Set(a.split(' ')), new Set(b.split(' ')));
    const cj = MockLlmProvider.jaccard(MockLlmProvider.ngrams(a, 3), MockLlmProvider.ngrams(b, 3));
    return (wj + cj) / 2;
  }
  private static ngrams(s: string, n: number): Set<string> {
    const g = new Set<string>();
    const t = s.replace(/ /g, '');
    for (let i = 0; i + n <= t.length; i++) g.add(t.slice(i, i + n));
    return g;
  }
  private static jaccard(a: Set<string>, b: Set<string>): number {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
  }

  // 컨설팅 분석(stub) — 메타·서류 목록 기반 휴리스틱 초안. 식별정보 미사용.
  async analyzeConsulting(input: ConsultingAnalysisInput): Promise<ConsultingAnalysisResult> {
    const types = new Set(input.documents.map((d) => d.type));
    const missing: string[] = [];
    if (!types.has('student_record')) missing.push('생활기록부(생기부)');
    if (!types.has('transcript')) missing.push('성적표');
    const label: Record<string, string> = { susi: '수시', jeongsi: '정시', both: '수시·정시', essay: '자소서·면접' };
    const interest = label[input.interest] ?? input.interest;
    const tight = input.grade === '고3' || input.grade === 'N수';
    this.logger.log(`[stub] analyzeConsulting grade=${input.grade} interest=${input.interest} docs=${input.documents.length}`);
    return {
      summary: {
        strengths: [`${input.grade} 학습 이력이 정리되어 있음`, `${interest} 준비 방향이 뚜렷함`],
        concerns: tight ? ['지원 전략 확정까지 시간이 촉박함'] : ['핵심 활동의 일관성 보강 필요'],
        highlights: [`제출 자료 ${input.documents.length}건 확인`],
      },
      diagnostic: {
        fit_directions: interest.includes('수시')
          ? ['학생부종합 중심 검토', '교과전형 병행 가능성']
          : ['정시 지원권 대학 재점검'],
        activity_suggestions: ['지원 학과 관련 심화활동 1건 추가', '자기소개서 소재 정리'],
        target_gap: '목표 대학 기준 대비 세부 격차는 성적표 원문 분석 후 산정 필요',
      },
      document_check: {
        missing,
        inconsistencies: [],
        requests: missing.length ? ['누락 서류 제출 요청'] : ['추가 요청 없음'],
      },
      model: 'mock',
    };
  }
}
