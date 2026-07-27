import { pickAssignee } from './qna-assign';

describe('pickAssignee (Q&A 강제배정 대상 선택)', () => {
  it('후보 없으면 null', () => {
    expect(pickAssignee([])).toBeNull();
  });
  it('최소 부하 교사 선택', () => {
    expect(
      pickAssignee([
        { teacherId: 'a', load: 3 },
        { teacherId: 'b', load: 1 },
        { teacherId: 'c', load: 2 },
      ]),
    ).toBe('b');
  });
  it('동점이면 먼저 온 후보', () => {
    expect(
      pickAssignee([
        { teacherId: 'a', load: 0 },
        { teacherId: 'b', load: 0 },
      ]),
    ).toBe('a');
  });
});
