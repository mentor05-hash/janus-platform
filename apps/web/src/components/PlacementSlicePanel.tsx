import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { track } from '../utils/track';

/**
 * 배치표 thin-slice 씬프론트(O76·O77) — 전체 표(iframe) 대신 검색 조건 일치 행만 서버에서 받아 표시.
 * 공개 상업화 기본 경로: 요청당 30행·검색어 2자+·계정당 600행/일(서버 강제). 전체표는 회원 열람 버튼으로 폴백.
 */
type Row = Record<string, unknown>;
type SliceRes = { available: boolean; total: number; rows: Row[]; capped: boolean; remainingToday?: number };

// 알려진 필드의 한글 헤더(그 외 필드는 키 그대로) — 데이터트랙 slices 스키마와 동기.
const HEAD_LABEL: Record<string, string> = {
  univ: '대학', dept: '학과(모집단위)', track: '군·전형', region: '지역',
  cut: '컷', cutNb: '누백컷', cutGrade: '등급컷', nb: '누백', grade: '등급', band: '밴드', pred: '예측선', memo: '비고',
};
const PREF_ORDER = ['univ', 'dept', 'track', 'region']; // 앞쪽 고정 열

function columnsOf(rows: Row[]): string[] {
  const keys = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const rest = [...keys].filter((k) => !PREF_ORDER.includes(k));
  return [...PREF_ORDER.filter((k) => keys.has(k)), ...rest];
}

export function PlacementSlicePanel({ slug, title, updated, canOpenFull, onOpenFull }: {
  slug: string; title: string; updated?: string;
  canOpenFull: boolean; onOpenFull: () => void;
}) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SliceRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const tracked = useRef(false);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) { setRes(null); setError(''); return; }
    timer.current = window.setTimeout(async () => {
      setBusy(true); setError('');
      try {
        const r = await api.get<SliceRes>(`/placement-hub/slice/${slug}?q=${encodeURIComponent(term)}`);
        setRes(r);
        if (!tracked.current) { track(slug, 'view', undefined, { view: 'slice-search' }); tracked.current = true; } // C3 — 최초 검색 1회만
      } catch (e) {
        setRes(null);
        setError(e instanceof ApiError ? e.message : '조회에 실패했어요. 잠시 후 다시 시도해 주세요.');
      } finally { setBusy(false); }
    }, 350); // 타이핑 디바운스 — 일일 행 상한 아끼기
    return () => window.clearTimeout(timer.current);
  }, [q, slug]);

  const cols = res && res.rows.length ? columnsOf(res.rows) : [];
  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', whiteSpace: 'nowrap', background: 'var(--fill, #f4f7fb)', position: 'sticky', top: 0 };
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, borderTop: '1px solid var(--line)', whiteSpace: 'nowrap' };

  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '22px 16px 40px' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{title}</h2>
          {updated && <span className="mono" style={{ fontSize: 11, color: 'var(--caption)' }}>갱신 {updated}</span>}
          <span style={{ flex: 1 }} />
          {canOpenFull && (
            <button type="button" className="btn ghost sm" onClick={onOpenFull}>전체표로 보기</button>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px' }}>
          대학·학과명으로 검색하면 해당 행만 표시됩니다(한 번에 최대 30행). 원본 표 전체는 열람 없이 검색만으로 확인하세요.
        </p>

        {/* 검색 */}
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 대학·학과 검색 (2자 이상 — 예: 서울, 컴퓨터, 간호)"
          aria-label="배치표 검색"
          style={{ fontSize: 14, padding: '11px 14px' }}
        />

        {/* 상태·결과 */}
        {error && (
          <div className="card" style={{ marginTop: 14, padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 13.5, color: 'var(--chip-danger, #b3261e)', fontWeight: 700 }}>{error}</div>
          </div>
        )}
        {!error && q.trim().length < 2 && (
          <div style={{ marginTop: 26, textAlign: 'center', color: 'var(--caption)' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>▦</div>
            <div style={{ fontSize: 13.5 }}>검색어를 입력하면 결과가 나타납니다.</div>
          </div>
        )}
        {!error && q.trim().length >= 2 && (busy && !res ? (
          <div style={{ marginTop: 26, textAlign: 'center', color: 'var(--caption)', fontSize: 13 }}>검색 중…</div>
        ) : res && (
          res.rows.length === 0 ? (
            <div style={{ marginTop: 26, textAlign: 'center', color: 'var(--caption)', fontSize: 13.5 }}>
              일치하는 항목이 없어요 — 검색어를 바꿔보세요.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '14px 0 8px', fontSize: 12, color: 'var(--muted)' }}>
                <b style={{ color: 'var(--ink)' }}>{res.total.toLocaleString()}건</b> 일치
                {res.capped && <span style={{ color: 'var(--j-gold-ink)', fontWeight: 700 }}>상위 {res.rows.length}행만 표시 — 검색어를 더 구체적으로</span>}
                <span style={{ flex: 1 }} />
                {res.remainingToday != null && <span style={{ color: 'var(--caption)' }}>오늘 남은 조회 {res.remainingToday.toLocaleString()}행</span>}
              </div>
              <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: '62vh' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{cols.map((c) => <th key={c} style={th}>{HEAD_LABEL[c] ?? c}</th>)}</tr></thead>
                  <tbody>
                    {res.rows.map((r, i) => (
                      <tr key={i}>
                        {cols.map((c) => <td key={c} style={td}>{r[c] == null ? '-' : String(r[c])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        ))}
      </div>
    </div>
  );
}
