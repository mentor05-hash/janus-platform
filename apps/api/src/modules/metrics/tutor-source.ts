/**
 * tutor_source 계측(경량) — 고용유형(freelance|salaried) 차원.
 * 단일 출처: teacher_profile.employment_type(없으면 freelance). 이벤트 시점 스냅샷으로 박제.
 * ⚠ 정산 금액·계산에 절대 개입하지 않는다. 순수 관측 라벨.
 */
export type TutorSource = 'freelance' | 'salaried';
export const TUTOR_SOURCE_PAGE = 'tutor_source';

/** 고용유형 → tutor_source. 미설정/미인식 값은 freelance(현재 전원 freelance가 기본). */
export function tutorSourceOf(employmentType: string | null | undefined): TutorSource {
  return employmentType === 'salaried' ? 'salaried' : 'freelance';
}
