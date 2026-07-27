import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotifyService } from '../notification/notify.service';
import { isProductKey, productLabel, PRODUCTS, type ProductKey } from './domain/products';

const DAY_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    private readonly notify: NotifyService,
  ) {}

  /** login_id 또는 UUID 로 계정 조회(관리자 편의 — UUID 를 몰라도 student01 로 부여). */
  async resolveAccount(ref: string): Promise<{ id: string; login_id: string; name: string; role: string }> {
    const r = (ref ?? '').trim();
    const acc = UUID_RE.test(r)
      ? await this.prisma.account.findUnique({ where: { id: r }, select: { id: true, login_id: true, name: true, role: true } })
      : await this.prisma.account.findUnique({ where: { login_id: r }, select: { id: true, login_id: true, name: true, role: true } });
    if (!acc) throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: `계정을 찾을 수 없습니다: ${r}` });
    return acc;
  }

  /** 관리자: 계정 + 권한 이력(활성/만료/취소) 한 번에 — UI 조회용. */
  async accountSummary(ref: string) {
    const account = await this.resolveAccount(ref);
    const entitlements = await this.list(account.id);
    const active = await this.activeServices(account.id);
    return { account, entitlements, activeServices: [...active] };
  }

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
   * 사용자용 "내 이용권" — 상품 단위로 묶어 활성/만료 분리 + 남은 일수.
   * 상품 1건이 서비스 여러 행을 만들므로 (product_key, expires_at) 로 묶어 카드 1개로.
   */
  async myEntitlements(accountId: string) {
    const rows = await this.prisma.service_entitlement.findMany({
      where: { account_id: accountId, revoked_at: null },
      orderBy: { granted_at: 'desc' },
    });
    const now = Date.now();
    const groups = new Map<string, { productKey: string | null; label: string; services: string[]; grantedAt: Date; expiresAt: Date | null; source: string }>();
    for (const r of rows) {
      const key = `${r.product_key ?? r.service_id}|${r.expires_at ? r.expires_at.getTime() : 'none'}`;
      const g = groups.get(key);
      if (g) g.services.push(r.service_id);
      else groups.set(key, { productKey: r.product_key, label: productLabel(r.product_key), services: [r.service_id], grantedAt: r.granted_at, expiresAt: r.expires_at, source: r.source });
    }
    const cards = [...groups.values()].map((g) => ({
      ...g,
      daysRemaining: g.expiresAt ? Math.ceil((g.expiresAt.getTime() - now) / DAY_MS) : null,
      active: !g.expiresAt || g.expiresAt.getTime() > now,
    }));
    return {
      active: cards.filter((c) => c.active).sort((a, b) => (a.daysRemaining ?? 1e9) - (b.daysRemaining ?? 1e9)),
      expired: cards.filter((c) => !c.active),
    };
  }

  /**
   * 만료 임박 알림(운영/스케줄) — expires_at 이 withinDays 이내로 남은 활성 권한 보유자에게
   * 계정당 1회 알림(expiry_notified_at 으로 멱등). 결제 훅/크론 또는 관리자 수동 실행.
   */
  async runExpiryCheck(withinDays = 7): Promise<{ notified: number; accounts: number }> {
    const now = new Date();
    const until = new Date(now.getTime() + withinDays * DAY_MS);
    const due = await this.prisma.service_entitlement.findMany({
      where: { revoked_at: null, expiry_notified_at: null, expires_at: { gt: now, lte: until } },
      orderBy: { expires_at: 'asc' },
    });
    if (!due.length) return { notified: 0, accounts: 0 };
    // 계정별 최소 남은일수·대표 상품으로 묶어 1회 알림.
    const byAcc = new Map<string, { minDays: number; label: string; ids: string[] }>();
    for (const r of due) {
      const days = Math.ceil(((r.expires_at as Date).getTime() - now.getTime()) / DAY_MS);
      const cur = byAcc.get(r.account_id);
      if (cur) { cur.ids.push(r.id); if (days < cur.minDays) { cur.minDays = days; cur.label = productLabel(r.product_key); } }
      else byAcc.set(r.account_id, { minDays: days, label: productLabel(r.product_key), ids: [r.id] });
    }
    for (const [accountId, info] of byAcc) {
      await this.notify.notify(accountId, 'entitlement_expiring', { days: info.minDays, product: info.label });
    }
    await this.prisma.service_entitlement.updateMany({
      where: { id: { in: due.map((r) => r.id) } },
      data: { expiry_notified_at: now },
    });
    return { notified: due.length, accounts: byAcc.size };
  }

  /**
   * 상품 1건 부여 = 그 상품이 여는 서비스 행들을 생성(멀티서비스 상품은 여러 행).
   * expiresAt 필수 원칙(일회성 기간제)이나, 프로모/무기한 예외를 위해 null 허용.
   */
  async grant(
    actor: AuthUser,
    accountRef: string,
    productKey: string,
    opts: { expiresAt?: Date | null; source?: string; note?: string } = {},
  ) {
    if (!isProductKey(productKey)) throw new BadRequestException({ code: 'PRODUCT_UNKNOWN', message: `알 수 없는 상품: ${productKey}` });
    const product = PRODUCTS[productKey as ProductKey];
    const accountId = (await this.resolveAccount(accountRef)).id; // login_id·UUID 모두 허용
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

  /**
   * 구독 번들 동기화 — 플랜 포함 상품(source='subscription')을 현재 구독에 맞춤.
   * 기존 구독-소스 권한은 취소 후 재부여(플랜 변경·해지 반영). 만료는 구독 수명에 연동(expires_at=null).
   */
  async syncSubscriptionProducts(accountId: string, productKeys: unknown, actorId?: string): Promise<{ granted: number }> {
    const keys = Array.isArray(productKeys) ? productKeys.filter((k): k is string => typeof k === 'string' && isProductKey(k)) : [];
    // 기존 구독 번들 권한 취소(플랜 변경/해지 시 이전 상품 회수).
    await this.prisma.service_entitlement.updateMany({
      where: { account_id: accountId, source: 'subscription', revoked_at: null },
      data: { revoked_at: new Date() },
    });
    if (!keys.length) return { granted: 0 };
    const rows = keys.flatMap((k) =>
      PRODUCTS[k as ProductKey].services.map((serviceId) => ({
        account_id: accountId, service_id: serviceId, product_key: k, source: 'subscription', expires_at: null, created_by: actorId ?? null,
      })),
    );
    await this.prisma.service_entitlement.createMany({ data: rows });
    return { granted: rows.length };
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
