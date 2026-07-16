import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { isProductKey, PRODUCTS, type ProductKey } from './domain/products';

/**
 * 상품 권한(entitlement) — 유료 상품 구매 시 계정에 서비스 해제 행을 부여.
 * 결정(2026-07-16): 일회성 기간제(expires_at·수능시즌). 결제 훅은 후속 — grant() 를 관리자/결제 콜백이 호출.
 * tier 는 role 파생(단일 소스)이라 유료는 role 승격이 아니라 여기서 서비스 단위로 연다:
 *   sso.entitlements() 가 이 활성 서비스와 role-티어 서비스를 합집합 → janus_sso.services 로 계산기·배치표 해제.
 */
@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 활성 권한의 서비스 id 집합 — 만료(expires_at≤now)·취소(revoked_at) 제외. */
  async activeServices(accountId: string): Promise<Set<string>> {
    const now = new Date();
    const rows = await this.prisma.service_entitlement.findMany({
      where: {
        account_id: accountId,
        revoked_at: null,
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      select: { service_id: true },
    });
    return new Set(rows.map((r) => r.service_id));
  }

  /** 계정의 권한 이력(활성/만료/취소 포함) — 관리자 조회용. */
  list(accountId: string) {
    return this.prisma.service_entitlement.findMany({
      where: { account_id: accountId },
      orderBy: { granted_at: 'desc' },
    });
  }

  /**
   * 상품 1건 부여 = 그 상품이 여는 서비스 행들을 생성(멀티서비스 상품은 여러 행).
   * expiresAt 필수 원칙(일회성 기간제)이나, 프로모/무기한 예외를 위해 null 허용.
   */
  async grant(
    actor: AuthUser,
    accountId: string,
    productKey: string,
    opts: { expiresAt?: Date | null; source?: string; note?: string } = {},
  ) {
    if (!isProductKey(productKey)) throw new BadRequestException({ code: 'PRODUCT_UNKNOWN', message: `알 수 없는 상품: ${productKey}` });
    const product = PRODUCTS[productKey as ProductKey];
    const created = await this.prisma.$transaction(
      product.services.map((serviceId) =>
        this.prisma.service_entitlement.create({
          data: {
            account_id: accountId,
            service_id: serviceId,
            product_key: product.key,
            source: opts.source ?? 'admin',
            expires_at: opts.expiresAt ?? null,
            note: opts.note ?? null,
            created_by: actor.id,
          },
        }),
      ),
    );
    await this.audit.record(actor, {
      action: 'entitlement.grant',
      targetType: 'account',
      targetId: accountId,
      summary: `상품 권한 부여(${product.label} · ${product.services.join(',')})`,
      meta: { productKey: product.key, services: product.services, expiresAt: opts.expiresAt ?? null, source: opts.source ?? 'admin' },
    });
    return created;
  }

  /** 권한 행 1건 취소(환불·오부여) — 소프트 삭제(revoked_at). */
  async revoke(actor: AuthUser, entitlementId: string) {
    const row = await this.prisma.service_entitlement.findUnique({ where: { id: entitlementId } });
    if (!row) throw new BadRequestException({ code: 'ENTITLEMENT_NOT_FOUND', message: '해당 권한이 없습니다.' });
    if (row.revoked_at) return row; // 멱등
    const updated = await this.prisma.service_entitlement.update({ where: { id: entitlementId }, data: { revoked_at: new Date() } });
    await this.audit.record(actor, {
      action: 'entitlement.revoke',
      targetType: 'account',
      targetId: row.account_id,
      summary: `상품 권한 취소(${row.product_key ?? row.service_id})`,
      meta: { entitlementId, serviceId: row.service_id, productKey: row.product_key },
    });
    return updated;
  }
}
