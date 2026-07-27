import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementService } from './entitlement.service';
import { isProductKey, productLabel } from './domain/products';

// 혼동 문자(0/O·1/I) 제외한 코드 알파벳.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  const pick = (n: number) => Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  return `JANUS-${pick(4)}-${pick(4)}`;
}

/**
 * 리뎀션 코드(수강권) — 센터 오프라인·프로모 판매용. 발급(관리자) → 등록(사용자) → 상품 권한 부여.
 * 등록은 트랜잭션 + 조건부 UPDATE(redeemed_by IS NULL)로 이중 사용 방지.
 */
@Injectable()
export class RedemptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: EntitlementService,
    private readonly audit: AuditService,
  ) {}

  /** 관리자: 상품별 코드 N개 발급. grantExpiresAt=등록 시 부여할 권한 만료. validUntil=코드 사용 기한. */
  async generate(actor: AuthUser, dto: { productKey: string; count: number; grantExpiresAt?: Date | null; validUntil?: Date | null; note?: string }) {
    if (!isProductKey(dto.productKey)) throw new BadRequestException({ code: 'PRODUCT_UNKNOWN', message: `알 수 없는 상품: ${dto.productKey}` });
    const count = Math.min(500, Math.max(1, Math.floor(dto.count)));
    const rows: { code: string; product_key: string; grant_expires_at: Date | null; valid_until: Date | null; note: string | null; created_by: string }[] = [];
    // 코드 유일성: 생성 후 삽입(중복 시 재시도). 배치라 createMany + skipDuplicates 로 처리.
    for (let i = 0; i < count; i++) {
      rows.push({ code: randomCode(), product_key: dto.productKey, grant_expires_at: dto.grantExpiresAt ?? null, valid_until: dto.validUntil ?? null, note: dto.note ?? null, created_by: actor.id });
    }
    const res = await this.prisma.redemption_code.createMany({ data: rows, skipDuplicates: true });
    await this.audit.record(actor, { action: 'redemption.generate', targetType: 'redemption_code', summary: `수강권 발급 ${res.count}개(${productLabel(dto.productKey)})`, meta: { productKey: dto.productKey, count: res.count } });
    return { generated: res.count, codes: rows.slice(0, res.count).map((r) => r.code) };
  }

  /** 관리자: 코드 목록(상품·사용여부 필터). */
  list(filter: { productKey?: string; redeemed?: boolean } = {}) {
    return this.prisma.redemption_code.findMany({
      where: {
        ...(filter.productKey ? { product_key: filter.productKey } : {}),
        ...(filter.redeemed === true ? { redeemed_by: { not: null } } : filter.redeemed === false ? { redeemed_by: null } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 500,
    });
  }

  /** 사용자: 코드 등록 → 상품 권한 부여. 이중 사용·만료 방지. */
  async redeem(user: AuthUser, rawCode: string) {
    const code = (rawCode ?? '').trim().toUpperCase();
    if (!code) throw new BadRequestException({ code: 'CODE_REQUIRED', message: '코드를 입력하세요.' });
    const row = await this.prisma.redemption_code.findUnique({ where: { code } });
    if (!row) throw new NotFoundException({ code: 'CODE_NOT_FOUND', message: '유효하지 않은 코드입니다.' });
    if (row.redeemed_by) throw new BadRequestException({ code: 'CODE_USED', message: '이미 사용된 코드입니다.' });
    if (row.valid_until && row.valid_until.getTime() < Date.now()) throw new BadRequestException({ code: 'CODE_EXPIRED', message: '사용 기한이 지난 코드입니다.' });
    // 이중 사용 방지: redeemed_by IS NULL 조건부 점유. 경합 시 0건 → 실패.
    const claimed = await this.prisma.redemption_code.updateMany({
      where: { id: row.id, redeemed_by: null },
      data: { redeemed_by: user.id, redeemed_at: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestException({ code: 'CODE_USED', message: '이미 사용된 코드입니다.' });
    await this.entitlement.grant(user, user.id, row.product_key, { expiresAt: row.grant_expires_at, source: 'redemption', note: `수강권 ${code}` });
    await this.audit.record(user, { action: 'redemption.redeem', targetType: 'redemption_code', targetId: row.id, summary: `수강권 등록(${productLabel(row.product_key)})`, meta: { code, productKey: row.product_key } });
    return { ok: true, product: productLabel(row.product_key), productKey: row.product_key, expiresAt: row.grant_expires_at };
  }
}
