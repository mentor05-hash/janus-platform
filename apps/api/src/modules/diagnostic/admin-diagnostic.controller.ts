import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DiagnosticService } from './diagnostic.service';

class CreateQuestionDto {
  @IsString() @MaxLength(20) subject!: string;
  @IsString() @MaxLength(30) unit!: string;
  @IsOptional() @IsString() @MaxLength(10) difficulty?: string;
  @IsString() @MaxLength(500) stem!: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  choices!: string[];
  @IsInt() @Min(0) @Max(5) answer!: number;
  @IsOptional() @IsString() @MaxLength(500) explanation?: string;
}
class ActiveDto {
  @IsBoolean() active!: boolean;
}

@Controller('admin/diagnostics')
export class AdminDiagnosticController {
  constructor(private readonly diag: DiagnosticService) {}

  /** POST /admin/diagnostics/questions — 문항 등록(admin). */
  @Post('questions')
  @Roles('admin')
  create(@Body() dto: CreateQuestionDto) {
    return this.diag.adminCreateQuestion(dto);
  }

  /** GET /admin/diagnostics/questions?subject= — 문항 목록(admin·정답 포함). */
  @Get('questions')
  @Roles('admin')
  list(@Query('subject') subject?: string) {
    return this.diag.adminListQuestions(subject || undefined);
  }

  /** PATCH /admin/diagnostics/questions/:id/active — 활성 토글(admin). */
  @Patch('questions/:id/active')
  @Roles('admin')
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActiveDto) {
    return this.diag.adminSetActive(id, dto.active);
  }
}
