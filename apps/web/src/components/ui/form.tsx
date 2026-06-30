import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

function Wrap({ label, hint, children }: { label?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="form-row">
      {label && <label className="label">{label}</label>}
      {children}
      {hint && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function TextField({
  label,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode }) {
  return (
    <Wrap label={label} hint={hint}>
      <input className="input" {...rest} />
    </Wrap>
  );
}

export function TextareaField({
  label,
  hint,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode }) {
  return (
    <Wrap label={label} hint={hint}>
      <textarea className="textarea" {...rest} />
    </Wrap>
  );
}

export function SelectField({
  label,
  hint,
  options,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  options?: { value: string; label: string }[];
}) {
  return (
    <Wrap label={label} hint={hint}>
      <select className="input" {...rest}>
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          : children}
      </select>
    </Wrap>
  );
}
