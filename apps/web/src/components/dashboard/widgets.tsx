import type { ReactNode } from 'react';
import { Card } from '../ui';

/**
 * 확장형 대시보드 위젯 키트. 새 대시보드 = 이 위젯들을 조합.
 * StatCard/StatGrid(KPI), BarList(순위 막대), SectionCard(섹션 래퍼).
 */

// ── KPI 단일 카드 ──
export function StatCard({
  label,
  value,
  unit,
  delta,
  tone = 'teal',
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  delta?: number; // 전기간 대비(%) — 양수 상승
  tone?: 'teal' | 'muted';
}) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 140 }}>
      <div style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: tone === 'teal' ? 'var(--teal)' : 'var(--ink)' }}>
        {value}
        {unit && <span style={{ fontSize: 14, marginLeft: 2, color: 'var(--muted)' }}>{unit}</span>}
      </div>
      {delta !== undefined && (
        <div style={{ fontSize: 12, color: delta >= 0 ? 'var(--chip-done)' : 'var(--chip-danger)' }}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
}

// ── KPI 그리드 ──
export function StatGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>{children}</div>;
}

// ── 순위 막대 리스트 ──
export interface BarItem {
  id: string;
  rank?: number;
  label: ReactNode;
  value: number;
  caption?: ReactNode;
}
export function BarList({ items, max, suffix }: { items: BarItem[]; max?: number; suffix?: string }) {
  const peak = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((it) => (
        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {it.rank !== undefined && (
            <span style={{ width: 24, fontWeight: 700, color: 'var(--teal)' }}>{it.rank}</span>
          )}
          <span style={{ width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {it.label}
          </span>
          <span className="meter" style={{ flex: 1, height: 14 }}>
            <span style={{ width: `${(it.value / peak) * 100}%` }} />
          </span>
          <span style={{ width: 48, textAlign: 'right', fontWeight: 700 }}>
            {it.value}
            {suffix}
          </span>
          {it.caption && (
            <span style={{ width: 160, fontSize: 12, color: 'var(--muted)' }}>{it.caption}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 섹션 카드(제목 + 설명 + 내용) ──
export function SectionCard({
  title,
  desc,
  actions,
  children,
}: {
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: desc ? 4 : 12 }}>
        <strong>{title}</strong>
        {actions}
      </div>
      {desc && <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>{desc}</p>}
      {children}
    </Card>
  );
}
