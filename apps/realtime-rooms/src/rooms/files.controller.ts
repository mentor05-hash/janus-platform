import { Controller, Get, NotFoundException, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { RoomTokenGuard, type RoomAuth } from './room-token.guard';
import { RoomsService } from './rooms.service';
import { StorageService } from './storage.service';

type UploadedFileLike = { buffer: Buffer; originalname: string; mimetype: string; size: number };
const MAX_FILE = 20 * 1024 * 1024; // 20MB

/** 참가자 첨부 업/다운로드 — 룸 토큰 인증. 파일은 발급 룸에 귀속(다른 룸 토큰으론 접근 불가). */
@Controller('api/rt/v1/files')
export class FilesController {
  constructor(private readonly svc: RoomsService, private readonly storage: StorageService) {}

  @UseGuards(RoomTokenGuard)
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE } }))
  async upload(@UploadedFile() file: UploadedFileLike, @Req() req: Request & { roomAuth: RoomAuth }) {
    if (!file) throw new NotFoundException('파일이 없습니다.');
    const { roomId, participantId } = req.roomAuth;
    // 먼저 레코드 id 를 만들기 위해 임시 저장 → 실제로는 id 를 스토리지 키로 사용
    const id = await this.svc.createFile(roomId, participantId, file.originalname, file.mimetype ?? null, file.size ?? null, 'pending');
    const path = await this.storage.save(id, file.buffer);
    await this.svc.setFilePath(id, path);
    return { id, fileUrl: `/api/rt/v1/files/${id}`, filename: file.originalname, mime: file.mimetype, size: file.size };
  }

  @UseGuards(RoomTokenGuard)
  @Get(':id')
  async download(@Param('id') id: string, @Req() req: Request & { roomAuth: RoomAuth }, @Res() res: Response) {
    const f = await this.svc.getFile(id);
    if (!f || f.room_id !== req.roomAuth.roomId) throw new NotFoundException('파일을 찾을 수 없습니다.');
    const data = await this.storage.read(f.storage_path);
    res.setHeader('Content-Type', f.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
    res.send(data);
  }
}
