import { Logger } from '@nestjs/common';
import { PutInput, StorageProvider } from '../storage.types';

/**
 * S3/Cloud Storage StorageProvider 자리표시자 (§10, §9).
 * 실 버킷·자격증명이 정해지면 aws-sdk 등으로 구현 교체. 현재는 미구성 — 명시적 실패.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger('StorageProvider:s3');

  constructor(private readonly bucket?: string) {
    this.logger.warn('S3StorageProvider 는 자격증명/버킷 미구성 상태입니다(STORAGE_PROVIDER=local 권장).');
  }

  private notConfigured(): never {
    throw new Error('S3 스토리지가 아직 구성되지 않았습니다(STORAGE_S3_BUCKET·자격증명 필요).');
  }

  put(_input: PutInput): Promise<{ key: string }> {
    return this.notConfigured();
  }
  get(_key: string): Promise<Buffer> {
    return this.notConfigured();
  }
  delete(_key: string): Promise<void> {
    return this.notConfigured();
  }
}
