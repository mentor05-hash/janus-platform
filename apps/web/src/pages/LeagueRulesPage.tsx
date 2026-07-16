import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader, Card, Badge, Spinner } from '../components/ui';

type Rule = { minAuthored: number; minAccepted: number; minRate: number } | null;
type Tier = { tier: number; label: string; entry: boolean; rule: Rule };
type Rules = { tiers: Tier[] };

const tierColor = (t: number) => (t === 1 ? 'var(--j-gold-ink)' : t === 2 ? 'var(--j-blue)' : 'var(--muted)');
const tierBg = (t: number) => (t === 1 ? 'var(--j-gold-soft)' : t === 2 ? 'var(--j-blue-soft)' : 'var(--surface-2)');
const tierIcon = (t: number) => (t === 1 ? '👑' : t === 2 ? '🏅' : '🌱');
const tierTagline: Record<number, string> = {
  3: '커뮤니티에 첫발을 디딘 모든 답변자. 여기서 실적을 쌓아 위로 올라갑니다.',
  2: '꾸준한 채택으로 신뢰를 증명한 답변자. 커뮤니티의 허리.',
  1: '최고 등급 — 질문자가 가장 믿고 기다리는 답변 마스터.',
};

/** 커뮤니티 Q&A 리그 규칙 안내 — 티어별 승급 요건(라이브 정책)·지표 정의·승급 방식. */
export function LeagueRulesPage() {
  const [rules, setRules] = useState<Rules | null>(null);

  useEffect(() => {
    api.get<Rules>('/qna/league/rules').then(setRules).catch(() => setRules({ tiers: [] }));
  }, []);

  // 상위(1부)부터 보여주는 편이 목표 지향적 — tier 오름차순을 뒤집어 1→2→3.
  const ordered = (rules?.tiers ?? []).slice().sort((a, b) => a.tier - b.tier);

  return (
    <div>
      <PageHeader title="Q&A 리그 규칙" sub="커뮤니티 답변 실적으로 등급이 오릅니다 — 3부(입문) → 2부(정예) → 1부(마스터)." />

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>한눈에</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-body)', margin: 0 }}>
          커뮤니티 게시판에 <b>답변</b>을 남기고, 질문자가 그 답변을 <b>채택</b>하면 실적이 쌓입니다.
          누적 <b>답변 수 · 채택 수 · 채택률</b>이 각 등급의 요건을 모두 넘으면 <b>자동 승급</b>합니다.
          숫자가 작을수록 상위 등급(1부가 최고)입니다.
        </p>
      </Card>

      {rules === null ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {ordered.map((t) => (
            <Card key={t.tier} style={{ borderLeft: `3px solid ${tierColor(t.tier)}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>{tierIcon(t.tier)}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: tierColor(t.tier), background: tierBg(t.tier), borderRadius: 8, padding: '3px 10px' }}>{t.label}</span>
                {t.entry && <Badge kind="soft">기본 등급</Badge>}
                {t.tier === 1 && <Badge kind="done">최고</Badge>}
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 10px' }}>{tierTagline[t.tier]}</p>
              {t.entry || !t.rule ? (
                <div style={{ fontSize: 13.5, color: 'var(--ink-body)' }}>가입 시 누구나 시작하는 등급 — 별도 요건 없이 답변 활동을 시작하세요.</div>
              ) : (
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>승급 요건 (아래 3가지 모두 충족)</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[
                      { k: '누적 답변', v: t.rule.minAuthored, unit: '개' },
                      { k: '채택 수', v: t.rule.minAccepted, unit: '개' },
                      { k: '채택률', v: t.rule.minRate, unit: '%' },
                    ].map((m) => (
                      <div key={m.k} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 14px', minWidth: 96 }}>
                        <div style={{ fontSize: 11, color: 'var(--caption)' }}>{m.k}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{m.v}<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}> {m.unit} 이상</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card style={{ marginTop: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>지표는 이렇게 계산돼요</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.9, color: 'var(--ink-body)' }}>
          <li><b>답변 수</b> — 커뮤니티 질문에 남긴 답변(신고로 숨김 처리된 답변은 제외).</li>
          <li><b>채택 수</b> — 질문자가 “채택”한 내 답변의 수. 질문당 한 개만 채택됩니다.</li>
          <li><b>채택률</b> — 채택 수 ÷ 답변 수 × 100(%). 답변이 없으면 0%.</li>
          <li><b>승급 시점</b> — 내 답변이 채택될 때마다 등급을 다시 계산해, 요건을 넘으면 즉시 승급하고 알림을 보냅니다.</li>
          <li><b>강등</b> — 없습니다. 한 번 올라간 등급은 유지됩니다(실적은 계속 누적).</li>
        </ul>
        <p style={{ fontSize: 12, color: 'var(--caption)', marginTop: 10, marginBottom: 0 }}>
          ※ 요건 수치는 운영 정책에 따라 조정될 수 있으며, 이 페이지는 항상 <b>현재 적용 중인 값</b>을 보여줍니다.
        </p>
      </Card>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link to="/student/community/board" className="btn" style={{ textDecoration: 'none' }}>커뮤니티 게시판으로</Link>
        <Link to="/student/league" className="btn ghost" style={{ textDecoration: 'none' }}>리더보드 보기</Link>
      </div>
    </div>
  );
}
