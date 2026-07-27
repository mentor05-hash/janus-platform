import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { coversPlacement } from '../entitlement/domain/products';
import { tierAtLeast, tierForRole, type SsoTier } from '../sso/domain/sso-token';
import { filterSliceRows, type SliceResult, type SliceRow } from './domain/slice';
import { injectWatermark, watermarkSnippet } from './domain/watermark';

/** 티켓 페이로드 — 파일 서빙 시 워터마크·감사에 쓸 열람자 신원(발급 시점 고정). */
interface TicketPayload { s: string; u: string; l: string; n: string; r: string }

/**
 * 배치표 허브(§CLAUDE.md 4) — 저작권 데이터(배치표·격차 리포트 HTML)는 repo 에 없고
 * `JANUS_DATA_DIR/placement-hub/` 에서 **런타임 서빙**만 한다(경로는 ENV 로만 참조).
 * manifest.json 이 허용목록: 목록에 없는 파일은 어떤 경로로도 내주지 않는다(경로 탈출 차단 2중).
 * 티어 게이트(무료/회원)는 W3 SSO 와 결합 예정 — manifest.tier 필드로 준비만 해 둔다.
 */
export interface HubTable {
  slug: string;
  title: string;
  short?: string; // 탭 라벨(짧은 이름)
  icon?: string; // 도메인 아이콘 슬롯(◱ ▦ ◈ ⧗ …)
  kind?: string; // gap | jeongsi | susi | kairos | doc
  updated?: string;
  badge?: string; // '6월 실채점' 등
  tier?: string; // free | member | paid | consultant (게이트는 후속)
  /** O77 투트랙: 'internal' = 내부 검증용(V1·V2 — 고속 유래 입력 포함본). 관리자(consultant)만,
   *  상품 권한(entitlement)으로도 열 수 없다. 미지정/'public' = 외부 공개 가능본(V3 청정 빌드만). */
  audience?: string;
  file: string; // placement-hub/ 기준 상대 파일명
}

@Injectable()
export class PlacementHubService {
  private readonly logger = new Logger('PlacementHub');

  /** 유료(비무료) 파일 열람 일일 상한(계정당) — 전 탭 자동 스크래핑 이상행동 차단(O76). */
  private static readonly FILE_DAY_CAP = 40;
  /** thin-slice 일일 행 상한(계정당) — 검색 반복으로 전량 수집 차단(O76). */
  private static readonly SLICE_ROW_DAY_CAP = 600;

  constructor(
    private readonly config: ConfigService,
    private readonly entitlement: EntitlementService,
    private readonly audit: AuditService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  private dayKey(): string {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  private baseDir(): string | null {
    const root = this.config.get<string>('JANUS_DATA_DIR');
    if (!root) return null;
    return path.join(root, 'placement-hub');
  }

  private readManifest(): HubTable[] {
    const base = this.baseDir();
    if (!base) return [];
    try {
      const raw = fs.readFileSync(path.join(base, 'manifest.json'), 'utf8');
      const j = JSON.parse(raw) as { tables?: HubTable[] };
      return (j.tables ?? []).filter((t) => t && t.slug && t.file);
    } catch {
      return []; // 데이터 미배치 환경(개발·CI) — 허브는 '준비 중'으로 동작
    }
  }

  /** 허브 목록 — 파일 내용은 주지 않고 메타만. */
  list(): { available: boolean; tables: Omit<HubTable, 'file'>[] } {
    const tables = this.readManifest().map(({ file: _file, ...meta }) => meta);
    return { available: tables.length > 0, tables };
  }

  /**
   * 격차 리포트 목표컷 실연동(N29) — 배치표 지원가능선(70%컷)을 `JANUS_DATA_DIR/placement-hub/targets.json`
   * 에서 검색해 제공. 컷 수치는 저작권 데이터라 repo 무반입(C6), 회원+ 로그인에게만(C2 — 컨트롤러 인증).
   * 데이터 미배치(개발·CI)면 available:false → 격차 페이지는 수동 입력 폴백.
   */
  searchTargets(user: AuthUser, q: string, mode: 'jeongsi' | 'susi' = 'jeongsi', limit = 20): { available: boolean; targets: Array<{ univ: string; dept: string; track?: string; cut: number }> } {
    if (!tierAtLeast(tierForRole(user.role), 'member')) return { available: false, targets: [] };
    const base = this.baseDir();
    if (!base) return { available: false, targets: [] };
    let all: Array<{ univ?: string; dept?: string; track?: string; mode?: string; cut?: unknown; cutNb?: unknown; cutGrade?: unknown }> = [];
    try {
      const raw = fs.readFileSync(path.join(base, 'targets.json'), 'utf8');
      const j = JSON.parse(raw) as { targets?: typeof all };
      all = j.targets ?? [];
    } catch {
      return { available: false, targets: [] };
    }
    const term = (q ?? '').trim();
    // 컷 값: mode 별 필드(정시=cut/cutNb, 수시=cut/cutGrade). mode 미지정 항목은 정시로 간주.
    const cutOf = (t: (typeof all)[number]): number => Number(t.cut ?? (mode === 'susi' ? t.cutGrade : t.cutNb));
    const valid = all
      .filter((t) => t && typeof t.univ === 'string' && typeof t.dept === 'string')
      .filter((t) => (t.mode ?? 'jeongsi') === mode)
      .filter((t) => Number.isFinite(cutOf(t)))
      .filter((t) => !term || `${t.univ} ${t.dept} ${t.track ?? ''}`.includes(term))
      .slice(0, Math.min(50, Math.max(1, limit)))
      .map((t) => ({ univ: t.univ as string, dept: t.dept as string, track: t.track, cut: Math.round(cutOf(t) * 100) / 100 }));
    return { available: true, targets: valid };
  }

  /**
   * O77 투트랙 게이트 — audience:'internal'(V1·V2, 고속 유래 입력 포함)은 관리자(consultant)만.
   * 상품 권한(entitlement)은 이 판정을 우회하지 못한다 — 외부 유료 공개는 V3 청정 빌드만.
   */
  private assertNotInternalOnly(user: AuthUser, entry: HubTable): void {
    if (entry.audience !== 'internal') return;
    if (!tierAtLeast(tierForRole(user.role), 'consultant')) {
      throw new ForbiddenException({ code: 'HUB_INTERNAL_ONLY', message: '내부 검증용 자료입니다 — 외부 공개본을 이용해 주세요.' });
    }
  }

  /** 표별 요구 티어(미지정=free). */
  private tierOf(entry: HubTable): SsoTier {
    const t = entry.tier;
    return t === 'member' || t === 'paid' || t === 'consultant' ? t : 'free';
  }

  private readonly TIER_LABEL: Record<SsoTier, string> = { free: '무료', member: '회원', paid: '유료 회원', consultant: '컨설턴트' };

  /**
   * 접합계약 C2 — 토큰 없으면 무료판만. 회원급 파일은 **사용자 티어가 표 요구 티어 이상일 때만**
   * 일회성 티켓 발급(iframe 은 헤더를 못 실으므로 티켓 방식). 티어 판정 = tierForRole(O53).
   */
  async issueTicket(user: AuthUser, slug: string): Promise<{ ticket: string }> {
    const entry = this.readManifest().find((t) => t.slug === slug);
    if (!entry) throw new NotFoundException({ code: 'HUB_NOT_FOUND', message: '해당 배치표가 없습니다.' });
    this.assertNotInternalOnly(user, entry); // O77 — 내부용(V1·V2)은 상품 권한으로도 불가
    const required = this.tierOf(entry);
    const userTier = tierForRole(user.role);
    if (!tierAtLeast(userTier, required)) {
      // 티어 미달이어도 유료 배치표 상품(entitlement)이 이 표(kind)를 덮으면 통과.
      const covered = required === 'paid' && coversPlacement(await this.entitlement.activeServices(user.id), entry.kind);
      if (!covered) {
        const need = this.TIER_LABEL[required];
        const msg = required === 'paid'
          ? '유료 배치표 상품 전용입니다 — 전체 배치표/정시 정밀배치표를 구매하면 열람할 수 있어요.'
          : required === 'consultant'
            ? '컨설턴트 전용 자료입니다.'
            : `${need}부터 열람할 수 있습니다.`;
        throw new ForbiddenException({ code: 'HUB_TIER_LOCKED', message: msg, requiredTier: required, yourTier: userTier });
      }
    }
    // 이상행동 상한(O76): 계정당 하루 유료 파일 티켓 N회 — 전 탭 자동 스크래핑 억제.
    const used = await this.cache.incr(`hubcap:file:${user.id}:${this.dayKey()}`, 86_400);
    if (used > PlacementHubService.FILE_DAY_CAP) {
      await this.audit.record(user, { action: 'hub.cap.file', targetType: 'placement', targetId: slug, summary: `유료표 일일 상한 초과(${used}회)` });
      throw new ForbiddenException({ code: 'HUB_DAILY_CAP', message: '오늘 열람 한도를 초과했습니다. 내일 다시 이용해 주세요.' });
    }
    // 열람자 신원(발급 시점 고정) — 파일 서빙 시 워터마크·감사(O76). name 은 조회 실패 시 loginId 폴백.
    const name = await this.entitlement.resolveAccount(user.id).then((a) => a.name).catch(() => user.loginId);
    const payload: TicketPayload = { s: slug, u: user.id, l: user.loginId, n: name, r: user.role };
    const ticket = crypto.randomUUID();
    await this.cache.set(`hubtkt:${ticket}`, JSON.stringify(payload), 120); // 2분 내 iframe 로드용
    await this.audit.record(user, { action: 'hub.ticket', targetType: 'placement', targetId: slug, summary: `배치표 티켓 발급(${slug})` });
    return { ticket };
  }

  /**
   * 허용목록 파일 스트리밍용 로드. slug 이외의 입력은 받지 않는다. 무료(tier=free/미지정)만 티켓 없이 공개.
   * 유료(비무료)는 ①티켓 1회용(재사용=재발급 강제) ②per-user 워터마크 주입 ③서빙 감사 로그(O76).
   */
  async fileHtml(slug: string, ticket?: string): Promise<{ html: Buffer | string; updated?: string }> {
    const base = this.baseDir();
    const entry = this.readManifest().find((t) => t.slug === slug);
    if (!base || !entry) throw new NotFoundException({ code: 'HUB_NOT_FOUND', message: '해당 배치표가 없습니다.' });
    // 내부용(O77)은 tier 표기와 무관하게 항상 티켓 필수 — 티켓 발급 단계가 관리자만 허용하므로 이중 잠금.
    const isFree = (!entry.tier || entry.tier === 'free') && entry.audience !== 'internal';
    let viewer: TicketPayload | null = null;
    if (!isFree) {
      const raw = ticket ? await this.cache.get<string>(`hubtkt:${ticket}`) : null;
      if (raw) {
        try {
          const p = JSON.parse(raw) as TicketPayload;
          if (p.s === slug) viewer = p;
        } catch {
          if (raw === slug) viewer = { s: slug, u: 'legacy', l: 'legacy', n: '열람자', r: 'student' }; // 구형 티켓 호환
        }
      }
      if (!viewer) throw new ForbiddenException({ code: 'HUB_TIER_LOCKED', message: '회원부터 열람할 수 있습니다 — 로그인 후 이용하세요.' });
      await this.cache.del(`hubtkt:${ticket}`); // 1회용 — 유출된 URL 재사용 차단(재열람은 재발급)
    }
    // 경로 탈출 차단: manifest 파일명이라도 base 밖이면 거부
    const abs = path.resolve(base, entry.file);
    if (!abs.startsWith(path.resolve(base) + path.sep)) {
      this.logger.warn(`경로 탈출 시도 차단: ${entry.file}`);
      throw new NotFoundException({ code: 'HUB_NOT_FOUND', message: '해당 배치표가 없습니다.' });
    }
    let buf: Buffer;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      throw new NotFoundException({ code: 'HUB_FILE_MISSING', message: '파일이 데이터 디렉토리에 없습니다.' });
    }
    if (!viewer) return { html: buf, updated: entry.updated }; // 무료판 — 원문 그대로
    // per-user 워터마크(가시 오버레이+지문 주석) + 서빙 감사 — 유출 억지·귀속(O76)
    const html = injectWatermark(
      buf.toString('utf8'),
      watermarkSnippet({ name: viewer.n, loginId: viewer.l, accountId: viewer.u, nowMs: Date.now() }),
    );
    await this.audit.record(
      { id: viewer.u, role: viewer.r as never, centerId: null, loginId: viewer.l },
      { action: 'hub.file', targetType: 'placement', targetId: slug, summary: `유료 배치표 서빙(${slug} → ${viewer.l})` },
    );
    return { html, updated: entry.updated };
  }

  /**
   * thin-slice 조회(O76) — 전체 파일 대신 검색 조건 일치 행만 반환. 공개 상업화의 핵심 방어:
   * 결제 계정 1개로 전체 데이터셋을 받을 수 없다(요청당 30행·계정당 일일 600행·검색어 2자+).
   * 데이터: JANUS_DATA_DIR/placement-hub/slices/<slug>.json (데이터 트랙이 생성 — README §slice).
   * 파일이 없으면 available:false → 프런트는 기존 전체 HTML(티켓) 경로 폴백.
   */
  async slice(user: AuthUser, slug: string, q: string, limit?: number): Promise<SliceResult & { remainingToday?: number }> {
    const entry = this.readManifest().find((t) => t.slug === slug);
    if (!entry) throw new NotFoundException({ code: 'HUB_NOT_FOUND', message: '해당 배치표가 없습니다.' });
    this.assertNotInternalOnly(user, entry); // O77 — 내부용(V1·V2)은 상품 권한으로도 불가
    // 게이트 — 티켓과 동일 판정(티어 또는 상품 권한)
    const required = this.tierOf(entry);
    if (!tierAtLeast(tierForRole(user.role), required)) {
      const covered = required === 'paid' && coversPlacement(await this.entitlement.activeServices(user.id), entry.kind);
      if (!covered) throw new ForbiddenException({ code: 'HUB_TIER_LOCKED', message: '이 자료는 상품 구매 후 열람할 수 있습니다.' });
    }
    const base = this.baseDir();
    if (!base) return { available: false, total: 0, rows: [], capped: false };
    let rows: SliceRow[] = [];
    try {
      const j = JSON.parse(fs.readFileSync(path.join(base, 'slices', `${slug}.json`), 'utf8')) as { rows?: SliceRow[] };
      rows = Array.isArray(j.rows) ? j.rows : [];
    } catch {
      return { available: false, total: 0, rows: [], capped: false }; // slice 미배치 — 전체파일 경로 폴백
    }
    const result = filterSliceRows(rows, q, limit);
    // 일일 행 상한(계정당) — 검색 반복으로 전량 수집 차단
    const capKey = `hubcap:slice:${user.id}:${this.dayKey()}`;
    const served = (await this.cache.get<number>(capKey)) ?? 0;
    if (served + result.rows.length > PlacementHubService.SLICE_ROW_DAY_CAP) {
      await this.audit.record(user, { action: 'hub.cap.slice', targetType: 'placement', targetId: slug, summary: `slice 일일 행 상한 초과(${served}행)` });
      throw new ForbiddenException({ code: 'HUB_DAILY_CAP', message: '오늘 조회 한도를 초과했습니다. 내일 다시 이용해 주세요.' });
    }
    await this.cache.set(capKey, served + result.rows.length, 86_400);
    return { ...result, remainingToday: PlacementHubService.SLICE_ROW_DAY_CAP - served - result.rows.length };
  }
}
