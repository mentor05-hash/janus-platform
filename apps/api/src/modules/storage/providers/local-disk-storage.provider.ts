import { promises as fs } from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { PutInput, StorageProvider } from '../storage.types';

/**
 * 로컬 디스크 StorageProvider (§10) — 실제 파일을 baseDir 하위에 저장.
 * baseDir 는 ENV STORAGE_LOCAL_DIR(기본 <cwd>/var/storage). 키의 경로 탈출(..)은 차단.
 */
@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  private readonly logger = new Logger('StorageProvider:local');

  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.baseDir, key);
    const root = path.resolve(this.baseDir);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error(`잘못된 저장 키(경로 탈출): ${key}`);
    }
    return full;
  }

  async put(input: PutInput): Promise<{ key: string }> {
    const full = this.resolve(input.key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, input.data);
    this.logger.log(`put ${input.key} (${input.data.length}B, ${input.contentType})`);
    return { key: input.key };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}
