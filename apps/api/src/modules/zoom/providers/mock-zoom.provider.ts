import { Injectable, Logger } from '@nestjs/common';
import { IssueJoinInput, JoinInfo, ZoomProvider } from '../zoom.types';

/**
 * 로컬 stub ZoomProvider — 예약 ID 기반 결정적 placeholder 입장 URL.
 * 실 Zoom 계정(§9 미결정)이 정해지면 ZoomApiProvider 로 교체.
 */
@Injectable()
export class MockZoomProvider implements ZoomProvider {
  private readonly logger = new Logger('ZoomProvider:mock');

  issueJoinUrl(input: IssueJoinInput): Promise<JoinInfo> {
    const meetingId = input.bookingId;
    const joinUrl = `https://meet.local/session/${input.bookingId}`;
    this.logger.log(
      `[stub] 입장 URL 발급 booking=${input.bookingId} → ${joinUrl}`,
    );
    return Promise.resolve({ joinUrl, meetingId });
  }
}
