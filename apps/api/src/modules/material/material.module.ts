import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { MaterialController } from './material.controller';
import { MaterialService } from './material.service';

/**
 * Material 바운디드 컨텍스트 — 선생님 자료실(업로드·게시·공개범위 열람).
 * StorageModule(FilesService) 재사용으로 파일 바이트 위임.
 */
@Module({
  imports: [StorageModule],
  controllers: [MaterialController],
  providers: [MaterialService],
  exports: [MaterialService],
})
export class MaterialModule {}
