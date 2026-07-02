import type { ButtonHTMLAttributes, ReactNode } from 'react';

// ── Button ──
type BtnVariant = 'primary' | 'ghost' | 'danger';
export function Button({
  variant = 'primary',
  size,
  block,
  loading,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: 'sm';
  block?: boolean;
  loading?: boolean;
}) {
  const cls = [
    'btn',
    variant === 'ghost' ? 'ghost' : '',
    variant === 'danger' ? 'danger' : '',
    size === 'sm' ? 'sm' : '',
    block ? 'block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? '처리 중…' : children}
    </button>
  );
}

// ── Card ──
export function Card({
  title,
  actions,
  children,
  style,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="card" style={style}>
      {(title || actions) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          {title && <strong>{title}</strong>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Badge (상태칩 + 등급) ──
type BadgeKind =
  | 'new'
  | 'confirmed'
  | 'done'
  | 'cancelled'
  | 'rejected'
  | 'noshow'
  | 'soft'
  | 'danger'
  | 'grade-s'
  | 'grade-a'
  | 'grade-b';
export function Badge({ kind = 'soft', children }: { kind?: BadgeKind; children: ReactNode }) {
  const isChip = ['new', 'confirmed', 'done', 'cancelled', 'rejected', 'noshow'].includes(kind);
  return <span className={`${isChip ? 'chip' : 'badge'} ${kind}`}>{children}</span>;
}

/** 등급 코드(S/A/B) → 뱃지. */
export function GradeBadge({ grade }: { grade?: string | null }) {
  const g = (grade ?? 'B').toUpperCase();
  const kind = g === 'S' ? 'grade-s' : g === 'A' ? 'grade-a' : 'grade-b';
  return <Badge kind={kind as 'grade-s'}>{g}</Badge>;
}

// ── Pager (서버 페이지네이션 컨트롤, §7) ──
export function Pager({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        {total != null ? `총 ${total.toLocaleString()}건 · ` : ''}{page} / {totalPages} 페이지
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(1)}>« 처음</Button>
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ 이전</Button>
        <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>다음 ›</Button>
        <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => onPage(totalPages)}>끝 »</Button>
      </div>
    </div>
  );
}

// ── PageHeader ──
export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions}
    </div>
  );
}

// ── 피드백 ──
export function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
      <div className="spinner" />
    </div>
  );
}
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** 로딩 스켈레톤 블록. w/h 는 CSS 크기. */
export function Skeleton({ w = '100%', h = 16, radius = 8, style }: { w?: number | string; h?: number | string; radius?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" aria-hidden="true" style={{ width: w, height: h, borderRadius: radius, ...style }} />;
}
/** 카드형 스켈레톤 목록(로딩 자리표시). */
export function SkeletonList({ rows = 3, cols = 1 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="불러오는 중" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
      {Array.from({ length: rows * cols }).map((_, i) => (
        <div key={i} className="card" style={{ display: 'grid', gap: 10 }}>
          <Skeleton w="45%" h={16} />
          <Skeleton w="70%" h={12} />
          <Skeleton w="30%" h={12} />
        </div>
      ))}
      <span className="sr-only">불러오는 중…</span>
    </div>
  );
}
export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="error">{children}</p> : null;
}

// ── 진행 막대 ──
export function Meter({ value, max = 100, width = 60 }: { value: number; max?: number; width?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="meter" style={{ width }}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}
