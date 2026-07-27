import { Module } from '@nestjs/common';
import { LectureModule } from '../lecture/lecture.module';
import { MaterialModule } from '../material/material.module';
import { PeopleModule } from '../people/people.module';
import { QnaModule } from '../qna/qna.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/** 전역 통합검색 — 강좌·자료·커뮤니티·선생님 도메인 서비스를 조합. */
@Module({
  imports: [LectureModule, MaterialModule, PeopleModule, QnaModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
