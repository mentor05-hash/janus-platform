import { filterSliceRows, SLICE_MAX_ROWS } from './slice';

describe('placement-hub thin-slice filter (O76)', () => {
  const rows = [
    { univ: '서울대', dept: '수학과', cut: 98 },
    { univ: '고려대', dept: '수학교육', cut: 95 },
    { univ: '연세대', dept: '물리', cut: 94 },
  ];

  it('문자열 필드 부분일치로 행을 고른다', () => {
    expect(filterSliceRows(rows, '수학').total).toBe(2);
    expect(filterSliceRows(rows, '물리').rows).toHaveLength(1);
  });

  it('limit 로 자르고 capped 를 표시한다(요청당 상한 클램프 포함)', () => {
    const one = filterSliceRows(rows, '수학', 1);
    expect(one.rows).toHaveLength(1);
    expect(one.capped).toBe(true);
    expect(filterSliceRows(rows, '수학', 999).rows).toHaveLength(2); // SLICE_MAX_ROWS 클램프
    expect(SLICE_MAX_ROWS).toBeLessThanOrEqual(50);
  });

  it('전량 훑기 차단: 빈/1자 검색은 0행, 숫자 필드는 매칭 제외', () => {
    expect(filterSliceRows(rows, '').rows).toHaveLength(0);
    expect(filterSliceRows(rows, '수').rows).toHaveLength(0);
    expect(filterSliceRows(rows, '98').total).toBe(0);
  });
});
