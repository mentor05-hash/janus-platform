import { Logger } from '@nestjs/common';
import { IssueJoinInput, JoinInfo, ZoomProvider } from '../zoom.types';

/**
 * 실 Zoom API ZoomProvider 자리표시자 (§9·§10).
 * 계정·OAuth 자격증명이 정해지면 meeting 생성 API 로 구현 교체. 현재는 명시적 실패.
 */
export class ZoomApiProvider implements ZoomProvider {
  private readonly logger = new Logger('ZoomProvider:zoom');

  constructor(private readonly accountId?: string) {
    this.logger.warn('ZoomApiProvider 는 자격증명 미구성 상태입니다(ZOOM_PROVIDER=mock 권장).');
  }

  issueJoinUrl(_input: IssueJoinInput): Promise<JoinInfo> {
    throw new Error('Zoom 연동이 아직 구성되지 않았습니다(ZOOM_ACCOUNT_ID·자격증명 필요).');
  }
}
