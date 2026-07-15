import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { tierAtLeast, tierForRole, type SsoTier } from '../sso/domain/sso-token';

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
  file: string; // placement-hub/ 기준 상대 파일명
}

@Injectable()
export class PlacementHubService {
  private readonly logger = new Logger('PlacementHub');

  constructor(
    private readonly config: ConfigService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

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
    const required = this.tierOf(entry);
    const userTier = tierForRole(user.role);
    if (!tierAtLeast(userTier, required)) {
      const need = this.TIER_LABEL[required];
      const msg = required === 'paid'
        ? '유료 회원 전용입니다 — 유료 전환은 준비 중입니다.'
        : required === 'consultant'
          ? '컨설턴트 전용 자료입니다.'
          : `${need}부터 열람할 수 있습니다.`;
      throw new ForbiddenException({ code: 'HUB_TIER_LOCKED', message: msg, requiredTier: required, yourTier: userTier });
    }
    const ticket = crypto.randomUUID();
    await this.cache.set(`hubtkt:${ticket}`, slug, 120); // 2분 내 iframe 로드용
    return { ticket };
  }

  /** 허용목록 파일 스트리밍용 로드. slug 이외의 입력은 받지 않는다. 무료(tier=free/미지정)만 티켓 없이 공개. */
  async fileHtml(slug: string, ticket?: string): Promise<{ html: Buffer; updated?: string }> {
    const base = this.baseDir();
    const entry = this.readManifest().find((t) => t.slug === slug);
    if (!base || !entry) throw new NotFoundException({ code: 'HUB_NOT_FOUND', message: '해당 배치표가 없습니다.' });
    const isFree = !entry.tier || entry.tier === 'free';
    if (!isFree) {
      const ok = ticket && (await this.cache.get<string>(`hubtkt:${ticket}`)) === slug;
      if (!ok) throw new ForbiddenException({ code: 'HUB_TIER_LOCKED', message: '회원부터 열람할 수 있습니다 — 로그인 후 이용하세요.' });
    }
    // 경로 탈출 차단: manifest 파일명이라도 base 밖이면 거부
    const abs = path.resolve(base, entry.file);
    if (!abs.startsWith(path.resolve(base) + path.sep)) {
      this.logger.warn(`경로 탈출 시도 차단: ${entry.file}`);
      throw new NotFoundException({ code: 'HUB_NOT_FOUND', message: '해당 배치표가 없습니다.' });
    }
    try {
      return { html: fs.readFileSync(abs), updated: entry.updated };
    } catch {
      throw new NotFoundException({ code: 'HUB_FILE_MISSING', message: '파일이 데이터 디렉토리에 없습니다.' });
    }
  }
}
