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

interface HubMeta { slug: string; title: string; short?: string; icon?: string; kind?: string; updated?: string; badge?: string; tier?: string }
interface HubList { available: boolean; tables: HubMeta[] }

const FILE_BASE = '/api/v1/placement-hub/file/';
const isFree = (t: HubMeta) => !t.tier || t.tier === 'free';

export function PlacementHubPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [list, setList] = useState<HubList | null>(null);
  const [active, setActive] = useState<string>('');
  const [srcs, setSrcs] = useState<Record<string, string>>({}); // 로드된 탭의 iframe src(티켓 포함) — 유지해 0초 전환
  const [error, setError] = useState(false);

  const seasonOff = params.get('season') === '0'; // 카이로스 숨김(원서 시즌 밖)

  async function srcFor(t: HubMeta): Promise<string | null> {
    if (isFree(t)) return FILE_BASE + t.slug;
    if (!user) return null; // 잠금 — 로그인 유도(C2)
    try {
      const { ticket } = await api.post<{ ticket: string }>('/placement-hub/ticket', { slug: t.slug });
      return `${FILE_BASE}${t.slug}?t=${ticket}`;
    } catch {
      return null;
    }
  }

  async function open(t: HubMeta) {
    setActive(t.slug);
    if (srcs[t.slug]) return;
    const src = await srcFor(t);
    if (src) setSrcs((m) => ({ ...m, [t.slug]: src }));
  }

  useEffect(() => {
    api.get<HubList>('/placement-hub/list')
      .then(async (l) => {
        const tables = l.tables.filter((t) => !(seasonOff && t.kind === 'kairos'));
        setList({ ...l, tables });
        const first = tables[0];
        if (first) {
          setActive(first.slug);
          const src = await srcFor(first);
          if (src) setSrcs((m) => ({ ...m, [first.slug]: src }));
          // 첫 그림이 뜬 뒤 나머지 "열람 가능한" 탭을 뒤에서 프리로드(시안: 기다림 없음)
          setTimeout(() => {
            tables.slice(1).forEach(async (t) => {
              const s = await srcFor(t);
              if (s) setSrcs((m) => (m[t.slug] ? m : { ...m, [t.slug]: s }));
            });
          }, 2500);
        }
      })
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const tables = list?.tables ?? [];
  const activeMeta = tables.find((t) => t.slug === active);
  const activeLocked = !!activeMeta && !isFree(activeMeta) && !user;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* GNB — 허브 크롬(고정) */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ maxWidth: 1380, margin: '0 auto', height: 58, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
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
          <span style={{ flex: 1 }} />
          {activeMeta?.updated && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--caption)', whiteSpace: 'nowrap' }}>갱신 {activeMeta.updated}</span>
          )}
          <Link to="/placement" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--j-ghost-bg)', border: '1px solid var(--j-ghost-border)', borderRadius: 999, padding: '5px 11px', whiteSpace: 'nowrap', textDecoration: 'none' }}>무료 미리보기</Link>
          {/* 골드 1개 — 상담 전환(접합계약 C3: id 고정, 계측 앵커) */}
          <Link id="consult-reserve" to="/consulting/apply" className="btn gold sm" style={{ textDecoration: 'none' }}>1:1 상담 예약</Link>
        </div>
        {/* 탭 — 그림만 바꾼다 */}
        {tables.length > 0 && (
          <div style={{ maxWidth: 1380, margin: '0 auto', padding: '0 16px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tables.map((t) => {
              const on = t.slug === active;
              const locked = !isFree(t) && !user;
              return (
                <button key={t.slug} type="button" onClick={() => void open(t)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 999,
                  border: on ? '1px solid var(--j-blue)' : '1px solid var(--j-ghost-border)',
                  background: on ? 'var(--j-blue)' : 'var(--j-ghost-bg)',
                  color: on ? '#fff' : 'var(--ink-body)', fontSize: 13, fontWeight: on ? 800 : 600,
                  whiteSpace: 'nowrap', cursor: 'pointer',
                }}>
                  <span>{locked ? '🔒' : t.icon ?? '▦'}</span>{t.short ?? t.title}
                  {t.badge && <span style={{ fontSize: 10, fontWeight: 700, color: on ? '#fff' : 'var(--j-gold-ink)', background: on ? 'rgba(255,255,255,.18)' : 'var(--j-gold-soft)', borderRadius: 999, padding: '2px 7px' }}>{t.badge}</span>}
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
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-body)', margin: '10px 0 18px' }}>
                실측 컷·검색·상세가 담긴 원본 표는 <b>회원부터</b> 열람할 수 있어요.<br />
                로그인하면 이 자리에서 바로 열립니다.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <Link to="/login" className="btn" style={{ textDecoration: 'none' }}>로그인</Link>
                <Link to="/placement" className="btn ghost" style={{ textDecoration: 'none' }}>무료 미리보기</Link>
              </div>
            </div>
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
