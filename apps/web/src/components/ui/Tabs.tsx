export interface TabItem {
  value: string;
  label: string;
}

/** 세그먼트 탭. 제어형(value/onChange). */
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tabs">
      {items.map((t) => (
        <button
          key={t.value}
          className={t.value === value ? 'active' : ''}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
