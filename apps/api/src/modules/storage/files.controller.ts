import {
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
  upload(@UploadedFile() file: UploadedFileLike, @CurrentUser() user: AuthUser) {
    return this.files.upload(user.id, file);
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
