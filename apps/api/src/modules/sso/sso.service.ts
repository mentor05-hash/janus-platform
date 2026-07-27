import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import {
  signSsoToken,
  SsoRole,
  SsoTier,
  tierAtLeast,
  tierForRole,
  verifySsoToken,
} from './domain/sso-token';

/**
 * 크로스서비스 SSO(O42) — 플랫폼 로그인 1회 → 연계 서비스(배치표·입결 등) 재로그인 없이 진입.
 * 서비스 추가 = sso_service 행 1개(코드 무변경). epoch 증가 = 해당 서비스 토큰 일괄 폐기.
 * 티어 판정: 로그인 = member 기본. paid 승격은 가격 확정(N23~N25) 후 membership 연동 — TODO 표기.
 */
@Injectable()
export class SsoService {
  private readonly secret: string;
  private readonly ttlSec = 15 * 60; // 진입용 15분(설계 §2) — 갱신은 재발급

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlement: EntitlementService,
    config: ConfigService,
  ) {
    this.secret =
      config.get<string>('SSO_JWT_SECRET') || 'dev-sso-secret-change';
  }

  /** 로그인 사용자 → 서비스 티어(단일 소스 tierForRole). paid 승격은 후속(멤버십 연동). */
  tierOf(user: AuthUser): SsoTier {
    return tierForRole(user.role);
  }

  /**
   * 접합계약 C2 — 로그인 사용자가 진입/해제 가능한 서비스 목록(등록 서비스 중 티어 충족분).
   * 웹이 이 결과로 localStorage.janus_sso = {tier, services} 를 세팅 → 계산기 iframe 이 읽어 잠금 해제.
   */
  async entitlements(
    user: AuthUser,
  ): Promise<{ tier: SsoTier; services: string[] }> {
    const tier = this.tierOf(user);
    const [all, purchased] = await Promise.all([
      this.prisma.sso_service.findMany({
        select: { id: true, min_tier: true },
      }),
      this.entitlement.activeServices(user.id), // 유료 상품으로 해제된 서비스(role 티어와 별개)
    ]);
    // role 티어로 열리는 서비스 ∪ 구매(entitlement)로 열린 서비스 — 유료 상품이 계산기·배치표를 연다.
    const services = Array.from(
      new Set([
        ...all
          .filter((s) => tierAtLeast(tier, s.min_tier as SsoTier))
          .map((s) => s.id),
        ...purchased,
      ]),
    );
    return { tier, services };
  }

  async issue(user: AuthUser, serviceId: string) {
    const svc = await this.prisma.sso_service.findUnique({
      where: { id: serviceId },
    });
    if (!svc)
      throw new NotFoundException({
        code: 'SSO_SERVICE_NOT_FOUND',
        message: '등록되지 않은 서비스입니다.',
      });
    const tier = this.tierOf(user);
    if (!tierAtLeast(tier, svc.min_tier as SsoTier)) {
      // 티어 미달이어도 유료 상품(entitlement)으로 이 서비스를 구매했으면 통과.
      const purchased = await this.entitlement.activeServices(user.id);
      if (!purchased.has(svc.id)) {
        throw new ForbiddenException({
          code: 'SSO_TIER_LOCKED',
          message: `이 서비스는 ${svc.min_tier} 티어부터 이용할 수 있습니다.`,
        });
      }
    }
    const scope = (svc.allowed_scopes as string[]) ?? ['view'];
    const token = signSsoToken(
      {
        sub: user.id,
        role: user.role as SsoRole,
        tier,
        aud: svc.id,
        scope,
        epoch: svc.epoch,
      },
      this.ttlSec,
      this.secret,
    );
    const origins = (svc.redirect_origins as string[]) ?? [];
    await this.audit.record(user, {
      action: 'sso.issue',
      targetType: 'sso_service',
      targetId: svc.id,
      summary: `SSO 발급(${svc.id}·${tier})`,
    });
    return {
      token,
      expiresInSec: this.ttlSec,
      // 오픈 리다이렉트 방지: 등록 origin 이 있을 때만 진입 URL 구성(설계 §3)
      url: origins.length
        ? `${origins[0].replace(/\/$/, '')}/?sso=${encodeURIComponent(token)}`
        : null,
    };
  }

  /** 정적 페이지 위임 검증(설계 §4) — 시크릿 없는 클라이언트가 호출. 감사 로그 겸용. */
  async verify(token: string, serviceId?: string) {
    // aud 를 모르면 토큰에서 읽어 epoch 조회(서명 검증이 우선이므로 안전)
    let aud = serviceId;
    if (!aud) {
      const peek = verifySsoToken(token, this.secret); // epoch 미검증 1차
      if (!peek.ok) return { ok: false as const, reason: peek.reason };
      aud = peek.payload.aud;
    }
    const svc = await this.prisma.sso_service.findUnique({
      where: { id: aud },
    });
    if (!svc)
      return { ok: false as const, reason: 'service_not_found' as const };
    const r = verifySsoToken(token, this.secret, svc.epoch, svc.id);
    if (!r.ok) return { ok: false as const, reason: r.reason };
    return {
      ok: true as const,
      sub: r.payload.sub,
      role: r.payload.role,
      tier: r.payload.tier,
      scope: r.payload.scope,
      service: svc.id,
      exp: r.payload.exp,
    };
  }

  /** 관리자: 레지스트리 목록. */
  listServices() {
    return this.prisma.sso_service.findMany({ orderBy: { id: 'asc' } });
  }

  /** 관리자: 서비스 등록/수정(행 1개 = 서비스 1개). */
  async upsertService(
    actor: AuthUser,
    dto: {
      id: string;
      name: string;
      allowedScopes?: string[];
      minTier?: string;
      redirectOrigins?: string[];
    },
  ) {
    const data = {
      name: dto.name,
      allowed_scopes: (dto.allowedScopes ?? ['view']) as object,
      min_tier: dto.minTier ?? 'member',
      redirect_origins: (dto.redirectOrigins ?? []) as object,
      updated_at: new Date(),
    };
    const svc = await this.prisma.sso_service.upsert({
      where: { id: dto.id },
      create: { id: dto.id, ...data },
      update: data,
    });
    await this.audit.record(actor, {
      action: 'sso.service.upsert',
      targetType: 'sso_service',
      targetId: svc.id,
      summary: `SSO 서비스 등록/수정(${svc.id})`,
      meta: dto,
    });
    return svc;
  }

  /** 관리자: epoch 증가 = 해당 서비스 기존 토큰 전량 무효(유출 대응, 설계 §2). */
  async revokeAll(actor: AuthUser, serviceId: string) {
    const svc = await this.prisma.sso_service.update({
      where: { id: serviceId },
      data: { epoch: { increment: 1 }, updated_at: new Date() },
    });
    await this.audit.record(actor, {
      action: 'sso.revoke_all',
      targetType: 'sso_service',
      targetId: svc.id,
      summary: `SSO 일괄 폐기(${svc.id} → epoch ${svc.epoch})`,
    });
    return { id: svc.id, epoch: svc.epoch };
  }
}
