import { useState } from 'react';
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

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 12s3.5 8 10 8a9.12 9.12 0 0 0 3.39-.61" />
          <path d="m2 2 20 20" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/** 비밀번호 입력 — 우측 눈 아이콘으로 표시/숨기기 토글. */
export function PasswordField({
  label,
  hint,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: ReactNode; hint?: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <Wrap label={label} hint={hint}>
      <div style={{ position: 'relative' }}>
        <input className="input" type={show ? 'text' : 'password'} style={{ paddingRight: 42 }} {...rest} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? '비밀번호 숨기기' : '비밀번호 표시'}
          title={show ? '숨기기' : '표시'}
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: show ? 'var(--teal)' : 'var(--muted)',
            padding: 0,
          }}
        >
          <EyeIcon off={!show} />
        </button>
      </div>
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
