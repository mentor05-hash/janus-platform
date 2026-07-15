/* 배치표 허브(/placement/hub) — 시안 janus_report_hub_v1 + 핸드오프(2026-07-14) 원칙:
 * "한 액자, 세 그림, 0초 전환" — GNB·탭 고정, 내용(iframe)만 스왑, 방문 탭 프리로드.
 * 접합계약 준수: C2 토큰 없으면 무료판만(회원급=로그인→일회성 티켓→iframe) ·
 *   C3 상담 전환 CTA id `consult-reserve` · C6 데이터는 JANUS_DATA_DIR 런타임 서빙(repo 무반입).
 * ?season=0 → 카이로스(시즌 한정) 탭 숨김(핸드오프 §1).
 * 데이터 미배치 환경에선 '준비 중' 안내 + 예시 미리보기(/placement)로 유도. */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { JanusLogo } from '../components/JanusLogo';
import { track } from '../utils/track';
import { GapReportPage } from './GapReportPage';

// 허브 안에서 iframe 대신 네이티브 React로 렌더하는 탭(시안: 격차 리포트는 앱 내부 화면).
const isNativeTab = (t: { kind?: string }) => t.kind === 'gap';

interface HubMeta { slug: string; title: string; short?: string; icon?: string; kind?: string; updated?: string; badge?: string; tier?: string; calc?: boolean; file?: string }
interface HubList { available: boolean; tables: HubMeta[] }

const FILE_BASE = '/api/v1/placement-hub/file/';

// 계산기 탭(repo 자산·저작권 데이터 0) — 별도 유료 서비스로 허브에 편입.
// tier=paid(유료 경계·0064), 자체 게이트(janus_sso)로 열림 → 회원은 티저(블러). page=계측 id.
const CALC_TABS: (HubMeta & { page: string })[] = [
  { slug: 'kairos', page: 'kairos', title: '카이로스 · 정시 지원분석', short: '카이로스', icon: '⧗', kind: 'kairos', tier: 'paid', badge: '유료', calc: true, file: '/calc/kairos.html' },
  { slug: 'alea', page: 'alea', title: '알레아 · 이벤트 확률', short: '알레아', icon: '◈', kind: 'alea', tier: 'paid', badge: '유료', calc: true, file: '/calc/alea.html' },
];
const isFree = (t: HubMeta) => !t.tier || t.tier === 'free';
// 티어 서열(O53·회원 게이트) — 서버가 진짜 게이트(티켓 발급 시 검증). 여기선 UX용.
const TIER_RANK: Record<string, number> = { free: 0, member: 1, paid: 2, consultant: 3 };
const requiredTier = (t: HubMeta): 'free' | 'member' | 'paid' | 'consultant' =>
  t.tier === 'member' || t.tier === 'paid' || t.tier === 'consultant' ? t.tier : 'free';
const TIER_LABEL: Record<string, string> = { free: '무료', member: '회원', paid: '유료 회원', consultant: '컨설턴트' };

/* janus_score(v22 규약 — O43·접합계약 C1). 키·이벤트명 변경 금지. */
interface JanusScore {
  gye: '이과' | '문과' | null; mode: 'std' | 'nb';
  kor?: number; mat?: number; tam1?: number; tam2?: number; nb?: number;
  eng?: number; han?: number; period: string; source: string;
}

export function PlacementHubPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  // 뷰어 티어(tierForRole 미러) — 비로그인=free, admin/hr=consultant, 그 외 로그인=member.
  const viewerTier = !user ? 'free' : user.role === 'admin' || user.role === 'hr' ? 'consultant' : 'member';
  // 계산기 탭은 항상 열림(계산기 내부가 janus_sso 로 자체 게이트 → 회원은 티저 표시). 배치표만 하드 게이트.
  const canOpen = (t: HubMeta) => t.calc || TIER_RANK[viewerTier] >= TIER_RANK[requiredTier(t)];
  const [params] = useSearchParams();
  const [list, setList] = useState<HubList | null>(null);
  const [active, setActive] = useState<string>('');
  const [srcs, setSrcs] = useState<Record<string, string>>({}); // 로드된 탭의 iframe src(티켓 포함) — 유지해 0초 전환
  const [error, setError] = useState(false);

  const seasonOff = params.get('season') === '0'; // 카이로스 숨김(원서 시즌 밖)
  const [scoreLinked, setScoreLinked] = useState<JanusScore | null>(null);

  // C1 성적 자동연동 — 로그인 학생(학부모)의 최신 성적을 v22 규약으로 주입.
  // 배치표 iframe 은 동일 출처(/api/v1/...)라 localStorage.janus_score 를 그대로 읽는다(ingest 계약).
  useEffect(() => {
    if (!user || (user.role !== 'student' && user.role !== 'guardian')) return;
    if (user.role === 'guardian') return; // 자녀 선택 UI 전 — 학생 본인만(후속: ?studentId=)
    api.get<JanusScore>('/scores/janus-score')
      .then((js) => {
        localStorage.setItem('janus_score', JSON.stringify(js));
        window.dispatchEvent(new CustomEvent('janus:score', { detail: js })); // 이벤트명 동결(C1)
        setScoreLinked(js);
      })
      .catch(() => setScoreLinked(null)); // NO_SCORE → 표에서 수동 입력 폴백(계약 §5)
  }, [user?.id, user?.role]);

  async function srcFor(t: HubMeta): Promise<string | null> {
    if (t.calc) return t.file ?? null; // 계산기: repo 정적 자산 직접(티켓 불요, 자체 게이트)
    if (isFree(t)) return FILE_BASE + t.slug;
    if (!canOpen(t)) return null; // 티어 미달 — 잠금(C2). 서버도 티켓 발급 시 재검증.
    try {
      const { ticket } = await api.post<{ ticket: string }>('/placement-hub/ticket', { slug: t.slug });
      return `${FILE_BASE}${t.slug}?t=${ticket}`;
    } catch {
      return null;
    }
  }

  async function open(t: HubMeta) {
    setActive(t.slug);
    if (t.calc) track(t.slug, 'view', undefined, { view: 'hub' }); // 계산기별 진입 계측(C3)
    if (isNativeTab(t) || srcs[t.slug]) return; // 네이티브 탭(격차)은 iframe 로드 안 함
    const src = await srcFor(t);
    if (src) setSrcs((m) => ({ ...m, [t.slug]: src }));
  }

  useEffect(() => track('baechi', 'view', undefined, { view: 'hub' }), []);

  // 시즌 밖(?season=0)이면 계산기 탭(카이로스·알레아) 숨김.
  const calcTabs = seasonOff ? [] : CALC_TABS;

  useEffect(() => {
    api.get<HubList>('/placement-hub/list')
      .then(async (l) => {
        // 배치표(데이터) 탭 + 계산기(repo) 탭 병합. 데이터 미배치여도 계산기는 노출.
        // 같은 slug(예: 구 manifest 의 kairos)는 repo 계산기 탭이 우선(자체 게이트·데이터 불요) → 데이터측 제거.
        const calcSlugs = new Set(calcTabs.map((t) => t.slug));
        const dataTables = l.tables.filter((t) => !(seasonOff && t.kind === 'kairos')).filter((t) => !calcSlugs.has(t.slug));
        const tables = [...dataTables, ...calcTabs];
        setList({ available: l.available || calcTabs.length > 0, tables });
        // 허브 얼굴 = 대표 배치표(정시) 우선 → 없으면 첫 비-네이티브(배치표/계산기) → 최후 tables[0].
        // (격차 리포트는 kind='gap' 네이티브 탭이라 기본에서 제외 — 전용 메뉴와 첫화면 중복 방지)
        const first = tables.find((t) => t.kind === 'jeongsi') ?? tables.find((t) => !isNativeTab(t)) ?? tables[0];
        if (first) {
          setActive(first.slug);
          if (!isNativeTab(first)) {
            const src = await srcFor(first);
            if (src) setSrcs((m) => ({ ...m, [first.slug]: src }));
          }
          // 첫 그림이 뜬 뒤 나머지 "열람 가능한" 탭을 뒤에서 프리로드(시안: 기다림 없음)
          setTimeout(() => {
            tables.filter((t) => !isNativeTab(t) && t.slug !== first.slug).forEach(async (t) => {
              const s = await srcFor(t);
              if (s) setSrcs((m) => (m[t.slug] ? m : { ...m, [t.slug]: s }));
            });
          }, 2500);
        }
      })
      .catch(async () => {
        setError(true);
        // 목록 조회 실패해도 계산기(repo 자산)는 노출 — 허브가 빈 화면이 되지 않게.
        if (calcTabs.length) {
          setList({ available: true, tables: calcTabs });
          const first = calcTabs[0];
          setActive(first.slug);
          const src = await srcFor(first);
          if (src) setSrcs((m) => ({ ...m, [first.slug]: src }));
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const tables = list?.tables ?? [];
  const activeMeta = tables.find((t) => t.slug === active);
  const activeLocked = !!activeMeta && !canOpen(activeMeta);
  const lockNeed = activeMeta ? requiredTier(activeMeta) : 'member';

  return (
    <div style={{ height: embedded ? 'calc(100vh - 40px)' : '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* GNB — 허브 크롬(고정). embedded 면 로고·브레드크럼은 사이드바가 대신 → 숨김, CTA·탭은 유지 */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ maxWidth: 1380, margin: '0 auto', height: 58, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {!embedded && <>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
              <JanusLogo size={26} />
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>야누스</span>
            </Link>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--j-blue)', background: 'var(--j-blue-soft)', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap' }}>입시배치표</span>
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8, fontSize: 12.5, color: 'var(--muted)' }}>
              <Link to="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>홈</Link>
              <span style={{ padding: '0 4px' }}>›</span>
              <Link to="/placement" style={{ color: 'var(--muted)', textDecoration: 'none' }}>배치표</Link>
              <span style={{ padding: '0 4px' }}>›</span>
              <b style={{ color: 'var(--ink)' }}>{activeMeta?.short ?? activeMeta?.title ?? '허브'}</b>
            </nav>
          </>}
          {embedded && <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>배치표 허브</span>}
          <span style={{ flex: 1 }} />
          {scoreLinked && (
            <span className="chip ai-human" title={`localStorage.janus_score 주입됨 (${scoreLinked.mode})`} style={{ fontSize: 10.5 }}>
              ✓ 성적 연동 · {scoreLinked.period}{scoreLinked.source === 'ocr' ? ' · OCR' : ''}
            </span>
          )}
          {activeMeta?.updated && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--caption)', whiteSpace: 'nowrap' }}>갱신 {activeMeta.updated}</span>
          )}
          <Link to="/placement" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--j-ghost-bg)', border: '1px solid var(--j-ghost-border)', borderRadius: 999, padding: '5px 11px', whiteSpace: 'nowrap', textDecoration: 'none' }}>무료 미리보기</Link>
          {/* 골드 1개 — 상담 전환(접합계약 C3: id 고정, 계측 앵커) */}
          <Link id="consult-reserve" to="/consulting/apply" className="btn gold sm" style={{ textDecoration: 'none' }}
            onClick={() => track('baechi', 'cta', 'consult-reserve', { view: 'hub' })}>1:1 상담 예약</Link>
        </div>
        {/* 탭 — 그림만 바꾼다(시안: underline) */}
        {tables.length > 0 && (
          <div style={{ maxWidth: 1380, margin: '0 auto', padding: '0 16px', display: 'flex', gap: 2, flexWrap: 'wrap', borderTop: '1px solid var(--line-soft)' }}>
            {tables.map((t) => {
              const on = t.slug === active;
              const locked = !canOpen(t);
              return (
                <button key={t.slug} type="button" onClick={() => void open(t)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 15px', borderRadius: 0,
                  border: 'none', background: 'none',
                  borderBottom: on ? '2.5px solid var(--j-blue)' : '2.5px solid transparent',
                  color: on ? 'var(--j-blue)' : 'var(--muted)', fontSize: 14, fontWeight: on ? 800 : 600,
                  whiteSpace: 'nowrap', cursor: 'pointer', marginBottom: -1,
                }}>
                  <span>{locked ? '🔒' : t.icon ?? '▦'}</span>{t.short ?? t.title}
                  {t.badge && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--j-gold-ink)', background: 'var(--j-gold-soft)', borderRadius: 999, padding: '2px 7px' }}>{t.badge}</span>}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* 내용 영역 — 로드된 탭의 iframe 을 유지해 0초 전환 */}
      <main style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {tables.length === 0 && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 20 }}>
            <div className="card" style={{ maxWidth: 520, textAlign: 'center', padding: 30 }}>
              <div style={{ fontSize: 34, marginBottom: 10 }}>▦</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
                {list === null && !error ? '허브 목록을 불러오는 중…' : '배치표 허브 준비 중'}
              </div>
              {(error || (list && !list.available)) && (
                <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-body)', margin: '10px 0 16px' }}>
                  배치표 원본은 저작권 데이터라 저장소에 포함되지 않습니다.<br />
                  서버의 <code className="mono">JANUS_DATA_DIR/placement-hub/</code> 에 파일과 manifest 를 배치하면
                  이 화면에 자동으로 나타납니다. <span style={{ color: 'var(--muted)' }}>(가이드: ops/placement/README.md)</span>
                </p>
              )}
              <Link to="/placement" className="btn" style={{ textDecoration: 'none' }}>예시 미리보기 열기</Link>
            </div>
          </div>
        )}

        {/* 잠금 패널(C2) — 비로그인 상태로 회원급 탭 선택 시 */}
        {activeLocked && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 20 }}>
            <div className="card" style={{ maxWidth: 460, textAlign: 'center', padding: 30 }}>
              <div style={{ fontSize: 34, marginBottom: 10 }}>🔒</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{activeMeta?.title}</div>
              {!user ? (
                <>
                  <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-body)', margin: '10px 0 18px' }}>
                    실측 컷·검색·상세가 담긴 원본 표는 <b>{TIER_LABEL[lockNeed]}부터</b> 열람할 수 있어요.<br />
                    로그인하면 이 자리에서 바로 열립니다.
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <Link to="/login" className="btn" style={{ textDecoration: 'none' }}>로그인</Link>
                    <Link to="/placement" className="btn ghost" style={{ textDecoration: 'none' }}>무료 미리보기</Link>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-body)', margin: '10px 0 18px' }}>
                    이 자료는 <b>{TIER_LABEL[lockNeed]} 전용</b>입니다.
                    {lockNeed === 'paid' ? ' 유료 전환은 준비 중입니다.' : lockNeed === 'consultant' ? ' 컨설턴트 계정에서 열람할 수 있어요.' : ''}
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <Link to="/placement" className="btn ghost" style={{ textDecoration: 'none' }}>무료 미리보기</Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 격차 리포트 — 네이티브 탭(시안: 허브 안 앱 화면) */}
        {activeMeta && isNativeTab(activeMeta) && !activeLocked && (
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: 'var(--bg)' }}>
            <GapReportPage />
          </div>
        )}

        {Object.entries(srcs).map(([slug, src]) => (
          <iframe
            key={slug}
            src={src}
            title={tables.find((t) => t.slug === slug)?.title ?? slug}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: slug === active && !activeLocked ? 'block' : 'none', background: '#fff' }}
          />
        ))}
      </main>

      {/* 면책 — 고정 푸터 라인 */}
      <footer style={{ flexShrink: 0, borderTop: '1px solid var(--line)', background: 'var(--surface)', padding: '7px 16px', fontSize: 11, color: 'var(--caption)', textAlign: 'center' }}>
        ⓘ 모든 수치는 지난 입시 데이터 기반 <b>추정치</b>이며 실제 결과를 보장하지 않습니다 · 개인 진학지도용 — 무단 캡처·재배포 금지 · © 2026 야누스 입시연구소
      </footer>
    </div>
  );
}
