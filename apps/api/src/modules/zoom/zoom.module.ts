import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockZoomProvider } from './providers/mock-zoom.provider';
import { ZoomApiProvider } from './providers/zoom-api.provider';
import { ZOOM_PROVIDER } from './zoom.types';

/**
 * Zoom 입장 URL 어댑터 모듈 (CLAUDE.md §9·§10).
 * ENV ZOOM_PROVIDER 로 구현 선택(mock|zoom, 기본 mock).
 */
@Module({
  providers: [
    {
      provide: ZOOM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const which = config.get<string>('ZOOM_PROVIDER') ?? 'mock';
        switch (which) {
          case 'zoom':
            return new ZoomApiProvider(config.get<string>('ZOOM_ACCOUNT_ID'));
          default:
            return new MockZoomProvider();
        }
      },
    },
  ],
  exports: [ZOOM_PROVIDER],
})
export class ZoomModule {}
