import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { FilesService } from './files.service';
import type { UploadedFileLike } from './storage.types';

/**
 * 파일 업로드/다운로드 (§10 StorageProvider). multipart 업로드 → stored_file 기록,
 * 다운로드는 소유권 게이트 후 원본 바이트 스트리밍(envelope 미적용 — @Res).
 */
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: UploadedFileLike,
    @CurrentUser() user: AuthUser,
  ) {
    return this.files.upload(user.id, file);
  }

  /** POST /files/pdf-page — PDF 업로드 → 원본 저장 + 첫 페이지 PNG. 반환: {id,pdfId,page,pageCount}. */
  @Post('pdf-page')
  @UseInterceptors(FileInterceptor('file'))
  pdfPage(
    @UploadedFile() file: UploadedFileLike,
    @CurrentUser() user: AuthUser,
  ) {
    return this.files.rasterizePdf(user.id, file);
  }

  /** POST /files/pdf-render — 저장된 PDF 의 특정 페이지 렌더(페이지 넘김). body: {pdfId, page}. */
  @Post('pdf-render')
  pdfRender(
    @Body() dto: { pdfId: string; page: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.files.renderPdfPage(user.id, dto.pdfId, Number(dto.page) || 1);
  }

  @Get(':id')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { data, filename, contentType } = await this.files.download(id, user);
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(data);
  }
}
