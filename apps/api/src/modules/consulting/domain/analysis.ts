// 컨설팅 LLM 분석 입력 빌더 (순수) — 설계안 §7 가드레일: 식별정보 마스킹.
// 이름·연락처는 절대 포함하지 않고, 학년·관심·상품·서류 메타만 전달한다.
import type { ConsultingAnalysisInput } from '../../llm/llm.types';

export interface AnalysisAppFields {
  student_grade: string;
  interest_type: string;
  package: string;
}
export interface AnalysisDocFields {
  type: string;
  original_name: string;
}

export function buildAnalysisInput(
  app: AnalysisAppFields,
  documents: AnalysisDocFields[],
): ConsultingAnalysisInput {
  return {
    grade: app.student_grade,
    interest: app.interest_type,
    package: app.package,
    documents: documents.map((d) => ({ type: d.type, name: d.original_name })),
  };
}
