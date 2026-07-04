import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 첨부 로컬 디스크 스토리지(MVP). 실서비스는 S3/GCS 어댑터로 교체 가능(§10 StorageProvider). */
@Injectable()
export class StorageService {
  private readonly dir = process.env.ROOMS_STORAGE_DIR || join(process.cwd(), 'var', 'storage');
  async save(id: string, buffer: Buffer): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, id), buffer);
    return id; // storage_path = 파일 id(상대). 백엔드 교체 시 이 규칙만 바꾸면 됨.
  }
  async read(storagePath: string): Promise<Buffer> {
    return readFile(join(this.dir, storagePath));
  }
}
