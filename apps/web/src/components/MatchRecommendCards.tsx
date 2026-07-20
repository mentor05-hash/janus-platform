import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { track } from '../utils/track';

/* 진단 기반 추천 상담사 카드 — 격차리포트 뷰·홈에서 노출. 카드 선택 시 기존 예약 플로우(선생님 상세)로 연결.
 * ⛔ 연락처·외부 링크 노출 없음(거래 완결). 합격 단정 문구 금지(카드는 매칭 근거만). */

type Card = {
  counselorId: string; name: string; subjects: string[]; modes: string[];
  rating: number; totalConsult: number; rank: number; reasons: string[]; isNew: boolean;
};
type Reco = { subjects: string[]; cards: Card[]; note?: string };

export function MatchRecommendCards({ subject, title = '진단 기반 추천 상담사' }: { subject?: string; title?: string }) {
  const [reco, setReco] = useState<Reco | null>(null);
  useEffect(() => {
    const q = subject ? `?subject=${encodeURIComponent(subject)}` : '';
    api.get<Reco>(`/match/recommend${q}`).then(setReco).catch(() => setReco({ subjects: [], cards: [] }));
  }, [subject]);

  if (!reco || reco.cards.length === 0) return null;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>🎯 {title}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        {reco.subjects.length ? `${reco.subjects.join('·')} 진단 결과로 골라봤어요.` : (reco.note ?? '적합한 상담사를 추천해요.')} 카드를 누르면 상담 예약으로 이어져요.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {reco.cards.map((c) => (
          <Link
            key={c.counselorId}
            to={`/student/search?teacher=${c.counselorId}`}
            onClick={() => { track('diag_match', 'cta', 'card-click', { counselorId: c.counselorId, rank: c.rank }); void api.post(`/match/recommend/${c.counselorId}/click`, {}).catch(() => {}); }}
            style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'block', background: 'var(--surface)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ fontSize: 14.5 }}>{c.name} 선생님</b>
              {c.isNew && <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--j-blue,#2F6FB3)', background: 'var(--j-blue-soft,#EEF4FB)', borderRadius: 5, padding: '1px 6px' }}>신규</span>}
              {c.rating >= 4 && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>★ {c.rating.toFixed(1)}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{(c.subjects ?? []).join('·') || '전과목'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {c.reasons.slice(0, 3).map((r, i) => (
                <span key={i} style={{ fontSize: 11, color: 'var(--teal,#2F6FB3)', background: 'var(--teal-50,#EEF4FB)', borderRadius: 999, padding: '2px 8px' }}>{r}</span>
              ))}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal,#2F6FB3)', marginTop: 10 }}>상담 예약 →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
