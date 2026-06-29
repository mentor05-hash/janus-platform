/**
 * ZoomProvider 어댑터 인터페이스 (CLAUDE.md §9·§10).
 * 로컬은 placeholder 입장 URL 발급, 클라우드는 실 Zoom(또는 구글밋·필기) 연동으로 교체
 * (코드 변경 없이 ENV ZOOM_PROVIDER 전환).
 */
export const ZOOM_PROVIDER = Symbol('ZOOM_PROVIDER');

export interface IssueJoinInput {
  bookingId: string;
  startAt: Date | null;
  endAt: Date | null;
  topic?: string;
}

export interface JoinInfo {
  joinUrl: string;
  meetingId: string;
}

export interface ZoomProvider {
  issueJoinUrl(input: IssueJoinInput): Promise<JoinInfo>;
}
