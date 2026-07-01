import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';

/** 커뮤니티 라운지 — 기관 내 공개 활동 읽기 전용 큐레이션. */
@Module({
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
