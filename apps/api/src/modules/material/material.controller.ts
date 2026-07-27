import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MaterialService } from './material.service';
import { CreateMaterialDto } from './dto/material.dto';
import type { UploadedFileLike } from '../storage/storage.types';

/**
 * 자료실 (§T). 게시=선생님, 열람/다운로드=공개범위 게이트(모든 역할), 삭제=작성자·관리자.
 */
@Controller('materials')
export class MaterialController {
  constructor(private readonly materials: MaterialService) {}

  /** POST /materials — 자료 게시(선생님, 파일 선택). */
  @Post()
  @Roles('teacher')
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Body() dto: CreateMaterialDto,
    @UploadedFile() file: UploadedFileLike,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materials.create(user, dto, file);
  }

  /** GET /materials — 공개범위에 맞는 자료 목록(모든 역할). mine=true 면 본인 게시물. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('subject') subject?: string,
    @Query('mine') mine?: string,
    @Query('category') category?: string,
    @Query('q') q?: string,
  ) {
    return this.materials.list(user, { subject, mine, category, q });
  }

  /** GET /materials/:id/download — 공개범위 게이트 후 원본 바이트. */
  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { data, filename, contentType } = await this.materials.download(
      user,
      id,
    );
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(data);
  }

  /** DELETE /materials/:id — 작성자 또는 관리자. */
  @Delete(':id')
  @Roles('teacher', 'admin', 'hr')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materials.remove(user, id);
  }
}
