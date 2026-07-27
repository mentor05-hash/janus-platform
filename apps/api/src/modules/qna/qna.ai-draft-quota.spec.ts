import { ConfigService } from '@nestjs/config';
import { QnaService } from './qna.service';
import type { CacheProvider } from '../../common/cache/cache.types';

/**
 * Q&A AI 초안의 **1층(사용자별) 한도** 검증 (B221).
 *
 * 고정하려는 것 두 가지:
 *   ① 한도를 넘으면 초안만 건너뛰고 **예외를 던지지 않는다** — 초안은 부수 기능이고
 *      호출 시점에 질문 등록은 이미 끝났다. 여기서 던지면 등록 흐름이 깨진다.
 *   ② 전역 상한을 **여기서 다시 세지 않는다** — 그건 어댑터(`draft` 용도)의 몫이다.
 *      예전에는 `qna:aidraft:{일자}` 카운터가 같은 호출을 두 번 셌다(O178 과 같은 결함).
 */

type DraftInput = {
  subject: string | null;
  difficulty: string | null;
  body: string;
};

/** private 메서드를 타입 있는 형태로 꺼낸다 — `as any` 로 부르면 검사가 통째로 꺼진다. */
type WithDraft = {
  generateAiDraft(
    actorId: string,
    postId: string,
    q: DraftInput,
  ): Promise<void>;
};

const draftOf = (svc: QnaService) => {
  const s = svc as unknown as WithDraft;
  return (actorId: string, postId: string, q: DraftInput) =>
    s.generateAiDraft(actorId, postId, q);
};

/** 카운터만 진짜로 동작하는 최소 캐시 스텁. */
function memCache() {
  const store = new Map<string, number>();
  const provider = {
    get: (k: string) => Promise.resolve(store.get(k)),
    set: () => Promise.resolve(),
    del: () => Promise.resolve(),
    incr: (k: string) => {
      const v = (store.get(k) ?? 0) + 1;
      store.set(k, v);
      return Promise.resolve(v);
    },
  } as unknown as CacheProvider;
  return { store, provider };
}

function makeService(perUserDay: number, draftAnswer: jest.Mock) {
  const cache = memCache();
  const config = {
    get: (k: string) =>
      k === 'LLM_DRAFT_PER_USER_DAY' ? String(perUserDay) : undefined,
  } as unknown as ConfigService;

  const update = jest.fn(() => Promise.resolve({}));
  const prisma = { qna_post: { update } } as unknown as ConstructorParameters<
    typeof QnaService
  >[0];
  const llm = { draftAnswer } as unknown as ConstructorParameters<
    typeof QnaService
  >[3];
  const stub = <T>() => ({}) as T;

  const svc = new QnaService(
    prisma,
    stub(), // pricing
    stub(), // credit
    llm,
    cache.provider,
    stub(), // booking
    stub(), // availability
    stub(), // notify
    stub(), // files
    stub(), // guard
    stub(), // policy
    config,
  );
  return { draft: draftOf(svc), cache, update };
}

const Q: DraftInput = { subject: '수학', difficulty: 'mid', body: '미분 질문' };
const ok = () => jest.fn(() => Promise.resolve({ body: '초안 본문' }));

describe('Q&A AI 초안 — 사용자별 일 한도(1층)', () => {
  it('한도 안에서는 초안이 생성되고 저장된다', async () => {
    const draftAnswer = ok();
    const { draft, update } = makeService(2, draftAnswer);

    await draft('user-1', 'post-1', Q);

    expect(draftAnswer).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('한도를 넘으면 LLM 을 부르지 않는다 — 초안만 건너뛴다', async () => {
    const draftAnswer = ok();
    const { draft } = makeService(2, draftAnswer);

    await draft('user-1', 'p1', Q);
    await draft('user-1', 'p2', Q);
    await draft('user-1', 'p3', Q); // 3번째 = 초과

    expect(draftAnswer).toHaveBeenCalledTimes(2);
  });

  it('한도 초과가 예외로 새지 않는다 — 질문 등록 흐름을 깨면 안 된다', async () => {
    const { draft } = makeService(1, ok());

    await draft('user-1', 'p1', Q);
    await expect(draft('user-1', 'p2', Q)).resolves.toBeUndefined();
  });

  it('한도는 사용자별로 격리된다 — 한 명이 다른 사람 몫을 태우지 못한다', async () => {
    const draftAnswer = ok();
    const { draft } = makeService(1, draftAnswer);

    await draft('user-1', 'p1', Q);
    await draft('user-1', 'p2', Q); // user-1 초과
    await draft('user-2', 'p3', Q); // user-2 는 영향 없음

    expect(draftAnswer).toHaveBeenCalledTimes(2);
  });

  it('LLM 실패는 무해하다 — 예외가 호출자에게 가지 않는다', async () => {
    const draftAnswer = jest.fn(() => Promise.reject(new Error('전역 상한')));
    const { draft, update } = makeService(5, draftAnswer);

    await expect(draft('user-1', 'p1', Q)).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it('전역 상한을 서비스에서 다시 세지 않는다 — 카운터는 사용자별 키 하나뿐', async () => {
    const { draft, cache } = makeService(5, ok());

    await draft('user-1', 'p1', Q);

    const keys = [...cache.store.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain('user-1'); // 사용자별 키
    expect(keys.some((k) => k.startsWith('qna:aidraft:'))).toBe(false); // 구 전역 카운터 없음
  });
});
