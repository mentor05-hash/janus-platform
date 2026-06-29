import { Logger } from '@nestjs/common';
import { ChargeInput, ChargeResult, PgProvider } from './pg.types';

/**
 * 실 PG PgProvider 자리표시자 (§9 O2·§10).
 * PG사·정기결제(빌링키) 자격증명이 정해지면 결제 승인 API 로 구현 교체. 현재는 명시적 실패.
 */
export class RealPgProvider implements PgProvider {
  private readonly logger = new Logger('PgProvider:real');

  constructor(private readonly which: string) {
    this.logger.warn(`RealPgProvider(${which}) 는 자격증명 미구성 상태입니다(PG_PROVIDER=mock 권장).`);
  }

  charge(_input: ChargeInput): Promise<ChargeResult> {
    throw new Error('실 PG 연동이 아직 구성되지 않았습니다(PG 자격증명·빌링키 필요).');
  }
}
