import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AcademicService } from './academic.service';

const TYPES = [
  'exam',
  'mock',
  'mock_apply',
  'suneung',
  'admission',
  'school',
  'etc',
] as const;

class EventDto {
  @IsString() @MaxLength(120) title!: string;
  @IsOptional() @IsIn(TYPES as unknown as string[]) type?: string;
  @IsString() startDate!: string;
  @IsOptional() @IsString() endDate?: string | null;
  @IsOptional() @IsString() @MaxLength(20) grade?: string | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsString() centerId?: string | null;
}
class EventPatchDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsIn(TYPES as unknown as string[]) type?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string | null;
  @IsOptional() @IsString() @MaxLength(20) grade?: string | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
}

/** 학사일정 — 관리자 CRUD + 로그인 사용자 조회. */
@Controller()
@ApiTags('학사일정')
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}

  // ── 관리자(본사·센터) ──
  @Post('admin/academic-events')
  @Roles('admin')
  create(@CurrentUser() user: AuthUser, @Body() dto: EventDto) {
    return this.academic.create(user, dto);
  }

  @Get('admin/academic-events')
  @Roles('admin')
  listAdmin(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('centerId') centerId?: string,
  ) {
    return this.academic.listAdmin(user, from, to, centerId);
  }

  @Patch('admin/academic-events/:id')
  @Roles('admin')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EventPatchDto,
  ) {
    return this.academic.update(user, id, dto);
  }

  @Delete('admin/academic-events/:id')
  @Roles('admin')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.academic.remove(user, id);
  }

  // ── 조회(로그인 전원: 학생·학부모·선생님·관리자) ──
  @Get('academic-events')
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.academic.listForViewer(user, from, to);
  }
}
