/**
 * Q&A 강제배정 — 배정 대상 선택(순수). 최소 부하 교사에게 배정(로드밸런싱), 동점이면 먼저.
 * 자격(unfit·소프트블록) 필터·부하 집계는 서비스가 하고, 여기서는 선택 규칙만(테스트 용이).
 */
export interface AssigneeCandidate {
  teacherId: string;
  load: number; // 현재 미답변 배정 질문 수
}

export function pickAssignee(cands: AssigneeCandidate[]): string | null {
  if (cands.length === 0) return null;
  return cands.reduce((best, c) => (c.load < best.load ? c : best)).teacherId;
}
