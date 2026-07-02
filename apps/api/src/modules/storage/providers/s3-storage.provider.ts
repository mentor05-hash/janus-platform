import { Logger } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PutInput, StorageProvider } from '../storage.types';

type S3Opts = { bucket?: string; region?: string };

/**
 * S3/Cloud Storage StorageProvider (§10·§9). ENV STORAGE_S3_BUCKET·AWS_REGION·
 * AWS_ACCESS_KEY_ID/SECRET(또는 IAM 역할)로 활성. 버킷 미구성 시 호출 시점에만 실패.
 * 자격증명은 AWS SDK 기본 체인(ENV/EC2·ECS 역할)에서 자동 해석.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger('StorageProvider:s3');
  private readonly client: S3Client | null;

  constructor(private readonly opts: S3Opts) {
    if (!opts.bucket) {
      this.logger.warn('S3 버킷 미구성(STORAGE_S3_BUCKET) — 호출 시 실패합니다(STORAGE_PROVIDER=local 권장).');
      this.client = null;
    } else {
      this.client = new S3Client({ region: opts.region ?? process.env.AWS_REGION ?? 'ap-northeast-2' });
    }
  }

  private ready(): { client: S3Client; bucket: string } {
    if (!this.client || !this.opts.bucket) {
      throw new Error('S3 스토리지가 아직 구성되지 않았습니다(STORAGE_S3_BUCKET·자격증명 필요).');
    }
    return { client: this.client, bucket: this.opts.bucket };
  }

  async put(input: PutInput): Promise<{ key: string }> {
    const { client, bucket } = this.ready();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: input.key, Body: input.data, ContentType: input.contentType }));
    this.logger.log(`put s3://${bucket}/${input.key} (${input.data.length}B)`);
    return { key: input.key };
  }

  async get(key: string): Promise<Buffer> {
    const { client, bucket } = this.ready();
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    const { client, bucket } = this.ready();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
