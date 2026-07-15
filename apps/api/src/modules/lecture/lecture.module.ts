import { Module } from '@nestjs/common';
import { LectureController } from './lecture.controller';
import { LectureService } from './lecture.service';

/** 강좌 v1 — 카탈로그·수강신청. 데모 강좌(합성)로 실동작, 실강좌는 후속 교사 등록. */
@Module({
  controllers: [LectureController],
  providers: [LectureService],
})
export class LectureModule {}
