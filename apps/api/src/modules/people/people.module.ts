import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { GuardianController } from './guardian.controller';
import { GuardianService } from './guardian.service';
import { HrController } from './hr.controller';
import { PeopleService } from './people.service';
import { TeachersController } from './teachers.controller';

/**
 * People 바운디드 컨텍스트 (CLAUDE.md §3).
 * 등록/프로필 — 학생·선생님·보호자 프로필, HR 등록·승인, 보호자 연결.
 */
@Module({
  imports: [NotificationModule],
  controllers: [TeachersController, HrController, GuardianController],
  providers: [PeopleService, GuardianService],
  exports: [PeopleService, GuardianService],
})
export class PeopleModule {}
