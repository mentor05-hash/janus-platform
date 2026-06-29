import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { NoteSaveState } from '../../../config/enums';

/** 상담 기록 저장 (POST /bookings/{id}/note). */
export class NoteDto {
  @IsOptional()
  @IsString()
  coreSummary?: string; // 공개

  @IsOptional()
  @IsString()
  memo?: string; // 내부

  @IsOptional()
  @IsString()
  homework?: string; // 공개

  @IsOptional()
  @IsString()
  futureDir?: string; // 공개

  @IsOptional()
  @IsBoolean()
  guardianVisible?: boolean;

  @IsIn(['draft', 'final'])
  saveState!: NoteSaveState;
}
