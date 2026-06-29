import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { PeopleService } from './people.service';
import { TeachersController } from './teachers.controller';

/**
 * People 바운디드 컨텍스트 (CLAUDE.md §3).
 * 등록/프로필 — 학생·선생님·보호자 프로필, HR 등록·승인.
 */
@Module({
  controllers: [TeachersController, HrController],
  providers: [PeopleService],
  exports: [PeopleService],
})
export class PeopleModule {}
