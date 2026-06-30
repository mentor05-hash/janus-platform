import { useEffect, type ReactNode } from 'react';
import { Button } from './primitives';

/**
 * 모달 — prompt()/confirm() 대체. 폼·확인 다이얼로그에 사용.
 * onClose 로 닫고, footer 에 액션 버튼. ESC·오버레이 클릭으로 닫힘.
 */
export function Modal({
  title,
  open,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** 간단 확인 다이얼로그용 표준 푸터. */
export function ConfirmFooter({
  onCancel,
  onConfirm,
  confirmLabel = '확인',
  danger,
  loading,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>
        취소
      </Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
        {confirmLabel}
      </Button>
    </>
  );
}
