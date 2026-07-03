/**
 * 학생 유형 — 학원생(재원) vs 외부학생(비재원).
 * DB: student_profile.type_code(자유 텍스트) + member_type('student','enrolled'|'external').
 * 벤치마크(크몽/튜터링 마켓 회원 차등): 유형에 따라 접근·요금·노출·통계를 분기.
 */
export type StudentType = 'enrolled' | 'external';

export const STUDENT_TYPE_LABEL: Record<StudentType, string> = {
  enrolled: '학원생',
  external: '외부학생',
};

/**
 * 프로필로부터 유형 판별.
 * - type_code 가 'external'/'enrolled' 로 명시되면 그대로.
 * - 미지정(null)이면 센터 소속 여부로 추정: center_id 있으면 재원, 없으면 외부.
 * 기존 데이터(type_code null)도 합리적으로 분류되어 게이팅이 무너지지 않게 함.
 */
export function resolveStudentType(profile: {
  type_code?: string | null;
  center_id?: string | null;
}): StudentType {
  const t = (profile.type_code ?? '').trim().toLowerCase();
  if (t === 'external' || t === '외부' || t === '외부학생') return 'external';
  if (t === 'enrolled' || t === '재원' || t === '학원생') return 'enrolled';
  return profile.center_id ? 'enrolled' : 'external';
}

export const isExternalStudent = (p: { type_code?: string | null; center_id?: string | null }) =>
  resolveStudentType(p) === 'external';
