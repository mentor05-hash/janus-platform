import { buildAnalysisInput } from './analysis';

describe('컨설팅 분석 입력 빌더(마스킹)', () => {
  const app = {
    student_grade: '고3',
    interest_type: 'both',
    package: 'season',
    // 아래 식별정보는 절대 입력에 포함되면 안 됨
    applicant_name: '홍길동',
    applicant_phone: '010-1234-5678',
  } as any;
  const docs = [
    { type: 'student_record', original_name: '생기부.pdf' },
    { type: 'transcript', original_name: '성적표.docx' },
  ];

  it('학년·관심·상품·서류 메타만 전달', () => {
    const input = buildAnalysisInput(app, docs);
    expect(input).toEqual({
      grade: '고3',
      interest: 'both',
      package: 'season',
      documents: [
        { type: 'student_record', name: '생기부.pdf' },
        { type: 'transcript', name: '성적표.docx' },
      ],
    });
  });

  it('식별정보(이름·연락처)는 포함되지 않음', () => {
    const json = JSON.stringify(buildAnalysisInput(app, docs));
    expect(json).not.toContain('홍길동');
    expect(json).not.toContain('010-1234-5678');
  });
});
