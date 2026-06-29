/**
 * 신고 처리 상태머신 (CLAUDE.md §6 Phase 3 — 신고·차단·AI 검토).
 * received → reviewing → resolved | dismissed.
 */
export type ReportStatus = 'received' | 'reviewing' | 'resolved' | 'dismissed';

export const REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  received: ['reviewing', 'resolved', 'dismissed'],
  reviewing: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

export function canReportTransition(from: ReportStatus, to: ReportStatus): boolean {
  return REPORT_TRANSITIONS[from]?.includes(to) ?? false;
}
