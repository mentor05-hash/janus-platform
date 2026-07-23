import { normalizeSubject, isCanonicalSubject, CANONICAL_SUBJECTS } from './qna-subject-canonical';

describe('normalizeSubject (N33 ㉚ 과목 정규화)', () => {
  it('canonical 대분류는 그대로', () => {
    for (const s of CANONICAL_SUBJECTS) expect(normalizeSubject(s)).toBe(s);
  });

  it('수학 계열 별칭 → 수학', () => {
    for (const a of ['미적분', '미적', '확률과통계', '확통', '기하', '수학1', '수1', '수학영역']) {
      expect(normalizeSubject(a)).toBe('수학');
    }
  });

  it('탐구 계열 별칭 → 과학탐구·사회탐구', () => {
    expect(normalizeSubject('물리')).toBe('과학탐구');
    expect(normalizeSubject('생명과학')).toBe('과학탐구');
    expect(normalizeSubject('지구과학')).toBe('과학탐구');
    expect(normalizeSubject('생윤')).toBe('사회탐구');
    expect(normalizeSubject('한국지리')).toBe('사회탐구');
  });

  it('공백·대소문자 무시(foldKey)', () => {
    expect(normalizeSubject('  미 적 분 ')).toBe('수학');
    expect(normalizeSubject('English')).toBe('영어');
    expect(normalizeSubject('영 어 1')).toBe('영어');
  });

  it('미인식 과목은 트림 원문 유지(정보 보존)', () => {
    expect(normalizeSubject('  코딩 ')).toBe('코딩');
    expect(normalizeSubject('논술')).toBe('논술');
  });

  it('빈/공백/누락은 ""(기타 버킷 결정은 호출부)', () => {
    expect(normalizeSubject('')).toBe('');
    expect(normalizeSubject('   ')).toBe('');
    expect(normalizeSubject(null)).toBe('');
    expect(normalizeSubject(undefined)).toBe('');
  });

  it('isCanonicalSubject', () => {
    expect(isCanonicalSubject('수학')).toBe(true);
    expect(isCanonicalSubject('미적분')).toBe(false); // 별칭은 canonical 아님
    expect(isCanonicalSubject('기타')).toBe(false);
  });
});
