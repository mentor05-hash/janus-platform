import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { LocalDiskStorageProvider } from './providers/local-disk-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { STORAGE_PROVIDER } from './storage.types';
import { SchoolRecordGuardModule } from '../guard/school-record-guard.module';

/**
 * Storage 바운디드 컨텍스트 (CLAUDE.md §10).
 * StorageProvider 어댑터를 ENV STORAGE_PROVIDER 로 선택(local|s3, 기본 local).
 */
@Module({
  imports: [SchoolRecordGuardModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const which = config.get<string>('STORAGE_PROVIDER') ?? 'local';
        switch (which) {
          case 's3':
            return new S3StorageProvider({
              bucket: config.get<string>('STORAGE_S3_BUCKET'),
              region: config.get<string>('AWS_REGION'),
            });
          default: {
            const dir =
              config.get<string>('STORAGE_LOCAL_DIR') ??
              path.resolve(process.cwd(), 'var/storage');
            return new LocalDiskStorageProvider(dir);
          }
        }
      },
    },
  ],
  exports: [STORAGE_PROVIDER, FilesService],
})
export class StorageModule {}
