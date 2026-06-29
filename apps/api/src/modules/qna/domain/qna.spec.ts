import { canAnswerQuestion } from './qna';

const T = 'teacher-1';

describe('Q&A 답변 권한(§5-9)', () => {
  it('지정 질문: 지정 교사만 답변', () => {
    expect(canAnswerQuestion({ scope: 'assigned', assignedTeacherId: T, teacherId: T, isUnfitForStudent: false }).allowed).toBe(true);
    expect(canAnswerQuestion({ scope: 'assigned', assignedTeacherId: 'other', teacherId: T, isUnfitForStudent: false }).allowed).toBe(false);
  });

  it('공개 질문: fit 교사는 답변 가능', () => {
    expect(canAnswerQuestion({ scope: 'open', assignedTeacherId: null, teacherId: T, isUnfitForStudent: false }).allowed).toBe(true);
  });

  it('공개 질문: unfit 교사는 가져갈 수 없음(§5-9)', () => {
    const r = canAnswerQuestion({ scope: 'open', assignedTeacherId: null, teacherId: T, isUnfitForStudent: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('unfit');
  });
});
