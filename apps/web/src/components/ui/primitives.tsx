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
