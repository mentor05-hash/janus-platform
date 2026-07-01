import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

/** 법/개인정보 — 약관·방침, 동의(미성년 보호자), 데이터 내보내기, 회원 탈퇴. */
@Module({
  controllers: [LegalController],
  providers: [LegalService],
})
export class LegalModule {}
