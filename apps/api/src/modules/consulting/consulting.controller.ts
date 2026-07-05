import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UploadedFileLike } from '../storage/storage.types';
import { ConsultingService } from './consulting.service';
import {
  AssignConsultantDto,
  CreateApplicationDto,
  CreatePaymentDto,
  UploadDocumentDto,
} from './dto/consulting.dto';

// 대입 컨설팅 신청 접수. 전 라우트는 전역 가드로 인증됨. 🔒=결제완료+권한 게이트.
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

  // ── Phase 2 ──────────────────────────────────────────────────────
  @Post('applications/:id/payment')
  createPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consulting.createPayment(id, dto, user);
  }

  @Post('applications/:id/payment/confirm')
  @Roles('admin', 'hr')
  @HttpCode(200)
  confirmPayment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.consulting.confirmPayment(id, user);
  }

  @Patch('applications/:id/assign')
  @Roles('admin', 'hr')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignConsultantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consulting.assignConsultant(id, dto, user);
  }

  // ── Phase 3: LLM 분석 (결제완료 게이트, 스태프/배정 컨설턴트) ──
  @Post('applications/:id/analysis')
  @HttpCode(200)
  runAnalysis(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.consulting.runAnalysis(id, user);
  }

  @Get('applications/:id/analysis')
  getAnalysis(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.consulting.getAnalysis(id, user);
  }

  // 자료 원문 다운로드(🔒 게이팅) — envelope 미적용(@Res 스트리밍).
  @Get('applications/:id/documents/:docId')
  async downloadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { data, filename, contentType } = await this.consulting.getDocument(id, docId, user);
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(data);
  }
}
