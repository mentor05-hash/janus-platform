import { Injectable, Logger } from '@nestjs/common';

/**
 * 정류장 좌표 → 행정동 코드 역산 어댑터 — 스펙 세션 3.
 * 실제 역지오코딩(행정경계 GIS/공공 API)은 데이터·키 확보 후. 현재는 stub:
 *   입력 dong_code 가 있으면 그대로 사용(운영자 입력 신뢰), 없으면 null.
 * ⚠ 좌표만으로 dong 을 지어내지 않는다(오매칭이 "우리 동네 경유"를 오염).
 */
@Injectable()
export class DongResolver {
  private readonly logger = new Logger(DongResolver.name);

  private mode(): 'stub' | 'real' {
    return process.env.DONG_GEOCODER === 'real' ? 'real' : 'stub';
  }

  /** 정류장의 dong_code 결정. 명시 입력 우선, 없으면 좌표 역산(stub 은 미지원 → null). */
  resolve(input: {
    dongCode?: string | null;
    lat?: number | null;
    lng?: number | null;
  }): Promise<string | null> {
    if (input.dongCode) return Promise.resolve(input.dongCode);
    if (this.mode() === 'real' && input.lat != null && input.lng != null) {
      // 실 연동 지점 — 역지오코딩 호출 후 dong_code 매핑.
      this.logger.warn('DONG_GEOCODER=real 이지만 미연동 — dong 미결정(null).');
      return Promise.resolve(null);
    }
    if (input.lat != null && input.lng != null) {
      this.logger.debug(
        '좌표만 제공되었으나 stub 은 역산 미지원 — dong_code 는 운영자 입력 필요.',
      );
    }
    return Promise.resolve(null);
  }
}
