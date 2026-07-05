import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { UploadedFileLike } from '../storage/storage.types';
import { ConsultingService } from './consulting.service';
import { CreateApplicationDto, UploadDocumentDto } from './dto/consulting.dto';

// 대입 컨설팅 신청 접수 — Phase 1(신청/업로드). 전 라우트는 전역 가드로 인증됨.
@Controller('consulting')
export class ConsultingController {
  constructor(private readonly consulting: ConsultingService) {}

  @Post('applications')
  create(@Body() dto: CreateApplicationDto, @CurrentUser() user: AuthUser) {
    return this.consulting.create(dto, user);
  }

  @Get('applications/:id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.consulting.getOne(id, user);
  }

  @Post('applications/:id/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadedFileLike,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consulting.uploadDocument(id, dto, file, user);
  }

  @Post('applications/:id/submit')
  @HttpCode(200)
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.consulting.submit(id, user);
  }
}
