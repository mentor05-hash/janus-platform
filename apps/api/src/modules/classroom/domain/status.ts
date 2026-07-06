// 강의(class_session) 상태머신 (순수) — 설계안. scheduled → live → ended · canceled.
export type ClassStatus = 'scheduled' | 'live' | 'ended' | 'canceled';

export const CLASS_TRANSITIONS: Record<ClassStatus, ClassStatus[]> = {
  scheduled: ['live', 'canceled'],
  live: ['ended'],
  ended: [],
  canceled: [],
};

export function canTransition(from: ClassStatus, to: ClassStatus): boolean {
  return CLASS_TRANSITIONS[from]?.includes(to) ?? false;
}
