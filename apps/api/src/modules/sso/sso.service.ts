import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountRole } from '../../config/enums';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { issueSsoToken, verifySsoToken, type SsoTier, type SsoToken } from './domain/token';
import { buildRegistry, isAllowedRedirect, tierMeets, type SsoServiceDef } from './domain/registry';

/**
 * 크로스서비스 SSO — 플랫폼 로그인 1회로 연계 서비스(학습 플래너·배치표 등) 재로그인 없이 진입.
 * 발급(POST /sso/token, 로그인 필요) / 검증(GET /sso/verify, 정적 페이지 위임).
 * 설계: `docs/SSO_토큰_일반화_설계_v1_2026-07-07.md` (O42). 티어 게이트 baseline(N25 W3 확정 전 잠정).
 */
@Injectable()
export class SsoService {
  private readonly secret: string;
  private readonly registry: Record<string, SsoServiceDef>;
  private readonly ttlSec = 15 * 60; // 진입용 15분(설계 §2). 갱신은 재발급.

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.secret = this.config.get<string>('SSO_JWT_SECRET') || 'dev-sso-secret-change';
    const origin = this.config.get<string>('SSO_REDIRECT_ORIGIN') || 'http://localhost:8080';
    this.registry = buildRegistry(origin);
  }

  private service(id: string): SsoServiceDef {
    const def = this.registry[id];
    if (!def) throw new NotFoundException('등록되지 않은 연계 서비스입니다.');
    return def;
  }

  /**
   * 로그인 주체의 SSO 티어 판정(잠정 baseline).
   * - 교직원(teacher/admin/hr)은 게이트를 넘는 최상위(consultant)로 취급.
   * - 학생/학부모는 활성 구독 등급의 tier(정수) → 라벨 매핑: 없음=free, ≥1=member, ≥2=paid.
   */
  private async resolveTier(user: AuthUser): Promise<SsoTier> {
    if (user.role !== AccountRole.STUDENT && user.role !== AccountRole.GUARDIAN) return 'consultant';
    const studentId = user.role === AccountRole.STUDENT ? user.id : null;
    if (!studentId) return 'free'; // 학부모 본인은 구독 주체 아님 — 무료 진입
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
      select: { membership_grade: { select: { tier: true } } },
    });
    const tier = sp?.membership_grade?.tier;
    if (tier == null) return 'free';
    return tier >= 2 ? 'paid' : tier >= 1 ? 'member' : 'free';
  }

  /** 발급: 티어 게이트 통과 시 토큰 + 진입 URL(`?sso=`) 반환. */
  async issue(user: AuthUser, serviceId: string, requestedScope?: string[]) {
    const def = this.service(serviceId);
    if (!isAllowedRedirect(def)) throw new BadRequestException('서비스 리다이렉트 설정이 올바르지 않습니다.');

    const tier = await this.resolveTier(user);
    if (!tierMeets(tier, def.minTier)) {
      throw new ForbiddenException(`${def.name} 진입은 ${def.minTier} 등급 이상만 가능합니다.`);
    }

    // 요청 scope 는 서비스 허용 상한으로 제한(상한 밖 요청은 조용히 절삭).
    const scope = (requestedScope?.length ? requestedScope : def.allowedScopes).filter((s) => def.allowedScopes.includes(s));

    const token = issueSsoToken(this.secret, { sub: user.id, role: user.role, tier, aud: def.id, scope, epoch: def.epoch }, this.ttlSec);
    const sep = def.launchUrl.includes('?') ? '&' : '?';
    const url = `${def.launchUrl}${sep}sso=${encodeURIComponent(token)}`;

    await this.audit.record(user, { action: 'sso.issue', targetType: 'sso_service', targetId: def.id, summary: `SSO 진입(${def.name})`, meta: { tier, scope } });
    return { token, url, service: def.id, name: def.name, tier, scope, expiresIn: this.ttlSec };
  }

  /**
   * 검증: 정적 티어 페이지의 `?sso=` 스니펫이 호출. 시크릿 없는 정적 페이지 대신 서버가 판정 →
   * UI 게이트 해제 근거 + 감사 로그. epoch 대조로 유출 토큰 일괄 무효화.
   */
  verify(token: string, serviceId?: string): { ok: false } | { ok: true; sub: string; tier: SsoTier; aud: string; scope: string[]; exp: number } {
    const payload: SsoToken | null = verifySsoToken(this.secret, token || '');
    if (!payload) return { ok: false };
    // 서비스 id 가 오면 aud 일치 + 현재 epoch 대조(일괄 폐기 반영).
    if (serviceId) {
      const def = this.registry[serviceId];
      if (!def || payload.aud !== def.id || payload.epoch !== def.epoch) return { ok: false };
    }
    return { ok: true, sub: payload.sub, tier: payload.tier, aud: payload.aud, scope: payload.scope ?? [], exp: payload.exp };
  }

  /** 진입 가능한 서비스 목록(로그인 사용자 티어 기준) — 웹 파트너 허브 카드 게이트용. */
  async listForUser(user: AuthUser) {
    const tier = await this.resolveTier(user);
    return Object.values(this.registry).map((d) => ({ id: d.id, name: d.name, minTier: d.minTier, allowed: tierMeets(tier, d.minTier) }));
  }
}
