import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { STORAGE_PROVIDER } from './storage.types';
import type { StorageProvider, UploadedFileLike } from './storage.types';

/**
 * 파일 업로드/다운로드 (StorageProvider 위임 + stored_file 소유권 기록).
 * 다운로드는 본인·관리자만(민감 첨부 보호, §5-10). 저장 백엔드는 ENV 로 교체.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** 이 선생님의 예약 중 해당 파일을 첨부로 가진 건이 있는지(jsonb 포함 검사). */
  private async teacherOwnsAttachment(teacherId: string, fileId: string): Promise<boolean> {
    const match = `[{"id":"${fileId}"}]`;
    // 담당 예약의 첨부(§5-10)
    const b = await this.prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM booking
      WHERE teacher_id = ${teacherId}::uuid
        AND attachments @> ${match}::jsonb
      LIMIT 1`;
    if (b.length > 0) return true;
    // Q&A 질문 첨부: 공개 큐(누구나 열람 가능) 또는 나에게 지정된 질문
    const q = await this.prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM qna_post
      WHERE attachments @> ${match}::jsonb
        AND (scope = 'open' OR assigned_teacher_id = ${teacherId}::uuid)
      LIMIT 1`;
    return q.length > 0;
  }

  async upload(ownerId: string, file: UploadedFileLike) {
    if (!file?.buffer?.length)
      throw new BadRequestException('업로드할 파일이 없습니다.');
    const key = `uploads/${randomUUID()}`;
    await this.storage.put({
      key,
      data: file.buffer,
      contentType: file.mimetype,
    });
    const row = await this.prisma.stored_file.create({
      data: {
        owner_id: ownerId,
        storage_key: key,
        filename: file.originalname,
        content_type: file.mimetype,
        size: file.size,
      },
      select: { id: true, filename: true, content_type: true, size: true },
    });
    return {
      id: row.id,
      filename: row.filename,
      contentType: row.content_type,
      size: row.size,
      url: `/files/${row.id}`,
    };
  }

  /**
   * PDF 첫 페이지를 서버에서 PNG 로 렌더(poppler pdftoppm)해 배경으로 저장.
   * 클라이언트 번들러(웹 Vite / 모바일 metro)에 pdfjs 를 넣지 않고 PDF 배경 지원.
   * 반환 형태는 upload 과 동일 → 기존 배경 로드/공유 경로 그대로 사용.
   */
  async rasterizePdfFirstPage(ownerId: string, file: UploadedFileLike) {
    if (!file?.buffer?.length) throw new BadRequestException('업로드할 파일이 없습니다.');
    const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname ?? '');
    if (!isPdf) throw new BadRequestException('PDF 파일이 아닙니다.');
    if (file.buffer.length > 40 * 1024 * 1024) throw new BadRequestException('PDF 가 너무 큽니다(40MB 초과).');

    const dir = await mkdtemp(join(tmpdir(), 'wbpdf-'));
    const pdfPath = join(dir, 'in.pdf');
    const outBase = join(dir, 'out'); // pdftoppm -singlefile → out.png
    try {
      await writeFile(pdfPath, file.buffer);
      // 첫 페이지만, 150dpi, 단일 파일(out.png). PNG.
      await promisify(execFile)('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', '-singlefile', pdfPath, outBase], { timeout: 20000 });
      const png = await readFile(`${outBase}.png`);
      const key = `uploads/${randomUUID()}`;
      await this.storage.put({ key, data: png, contentType: 'image/png' });
      const name = (file.originalname ?? 'document').replace(/\.pdf$/i, '') + '.png';
      const row = await this.prisma.stored_file.create({
        data: { owner_id: ownerId, storage_key: key, filename: name, content_type: 'image/png', size: png.length },
        select: { id: true, filename: true, content_type: true, size: true },
      });
      return { id: row.id, filename: row.filename, contentType: row.content_type, size: row.size, url: `/files/${row.id}` };
    } catch (e) {
      throw new BadRequestException(`PDF 변환 실패: ${(e as Error).message}`);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** 다운로드용 메타+바이트. 소유자 또는 관리자만 접근. */
  async download(id: string, user: AuthUser) {
    const row = await this.prisma.stored_file.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('파일을 찾을 수 없습니다.');
    const allowed =
      row.owner_id === user.id ||
      user.role === AccountRole.ADMIN ||
      // 학생이 예약에 첨부한 문제 파일 → 그 예약의 담당 선생님은 열람 가능(§5-10)
      (user.role === AccountRole.TEACHER && (await this.teacherOwnsAttachment(user.id, id)));
    if (!allowed) {
      throw new ForbiddenException('이 파일에 접근할 권한이 없습니다.');
    }
    const data = await this.storage.get(row.storage_key);
    return { data, filename: row.filename, contentType: row.content_type };
  }

  /**
   * 인증 게이트 없이 파일 바이트+메타 반환(내부용). 호출측이 자체 접근제어를 수행해야 함
   * (예: MaterialsService 의 공개범위 검증 후 다운로드).
   */
  async readBytes(storedFileId: string) {
    const row = await this.prisma.stored_file.findUnique({
      where: { id: storedFileId },
    });
    if (!row) throw new NotFoundException('파일을 찾을 수 없습니다.');
    const data = await this.storage.get(row.storage_key);
    return { data, filename: row.filename, contentType: row.content_type };
  }
}
