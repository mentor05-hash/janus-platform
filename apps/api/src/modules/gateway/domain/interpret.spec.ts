import {
  classifyGateway,
  classifyGatewayLlmFailure,
  maskSensitive,
  normalizeLlmResult,
} from './interpret';

describe('maskSensitive (LLM 투입 전 민감정보 마스킹)', () => {
  it('휴대전화·이메일·주민번호를 토큰으로 치환', () => {
    const { masked, hits } = maskSensitive(
      '연락처 010-1234-5678, 메일 kim@test.com, 주민 990101-1234567 입니다',
    );
    expect(masked).not.toContain('010-1234-5678');
    expect(masked).not.toContain('kim@test.com');
    expect(masked).not.toContain('990101-1234567');
    expect(masked).toContain('[전화번호]');
    expect(masked).toContain('[이메일]');
    expect(masked).toContain('[주민번호]');
    expect(hits).toBe(3);
  });

  it('민감정보 없으면 원문 유지 + 300자 절단', () => {
    const long = '가'.repeat(400);
    const { masked, hits } = maskSensitive(long);
    expect(hits).toBe(0);
    expect(masked.length).toBe(300);
  });
});

describe('classifyGateway (규칙 폴백 분류)', () => {
  it('진단 의도: 성적·배치 키워드', () => {
    const r = classifyGateway('정시로 컴공에 가고 싶어요');
    expect(r.intent).toBe('diagnosis');
    expect(r.cards.length).toBeGreaterThan(0);
    expect(r.cards[0].to).toBe('/placement');
  });

  it('질문 의도: 문제·모르 키워드', () => {
    expect(classifyGateway('이 수학 문제 풀이를 모르겠어요').intent).toBe(
      'qna',
    );
  });

  it('멘탈 의도(우선순위 최상): 불안 키워드가 성적보다 먼저', () => {
    expect(classifyGateway('성적 때문에 불안해서 잠이 안 와요').intent).toBe(
      'mental',
    );
  });

  it('해당 없음 → unknown + 기본 카드 3장', () => {
    const r = classifyGateway('안녕하세요');
    expect(r.intent).toBe('unknown');
    expect(r.cards).toHaveLength(3);
  });
});

describe('normalizeLlmResult (LLM 산출 보정 — 폴백 불변식)', () => {
  it('모르는 intent → unknown + 규칙 카드 대체', () => {
    const r = normalizeLlmResult({
      intent: 'hacking' as never,
      summary: '',
      cards: [],
    });
    expect(r.intent).toBe('unknown');
    expect(r.cards.length).toBeGreaterThan(0);
  });

  it('정상 산출은 3장으로 절단·통과', () => {
    const cards = Array.from({ length: 5 }, (_, i) => ({
      title: `c${i}`,
      desc: '',
      service: 'qna' as const,
      to: '/x',
    }));
    const r = normalizeLlmResult({ intent: 'qna', summary: '요약', cards });
    expect(r.intent).toBe('qna');
    expect(r.cards).toHaveLength(3);
    expect(r.summary).toBe('요약');
  });

  it('null/undefined 안전', () => {
    expect(normalizeLlmResult(null).intent).toBe('unknown');
    expect(normalizeLlmResult(undefined).cards.length).toBeGreaterThan(0);
  });
});

describe('classifyGatewayLlmFailure (실패 사유 분류)', () => {
  // 일 상한 도달을 '모델 오류'로 기록하면 운영자가 원인을 잘못 짚는다 — 반드시 구분되어야 한다.
  it('어댑터 상한 초과는 daily_cap', () => {
    const e = {
      getResponse: () => ({ error: { code: 'AI_QUOTA_EXCEEDED' } }),
      message: 'quota',
    };
    expect(classifyGatewayLlmFailure(e)).toBe('daily_cap');
  });

  it('미구성은 unconfigured', () => {
    expect(
      classifyGatewayLlmFailure(new Error('LLM 이 구성되지 않았습니다')),
    ).toBe('unconfigured');
    expect(classifyGatewayLlmFailure(new Error('지원하지 않는 provider'))).toBe(
      'unconfigured',
    );
  });

  it('그 밖은 llm_error', () => {
    expect(classifyGatewayLlmFailure(new Error('timeout'))).toBe('llm_error');
    expect(classifyGatewayLlmFailure(undefined)).toBe('llm_error');
  });

  it('다른 코드의 HttpException 은 상한이 아니다', () => {
    const e = { getResponse: () => ({ error: { code: 'SOMETHING_ELSE' } }) };
    expect(classifyGatewayLlmFailure(e)).toBe('llm_error');
  });
});
