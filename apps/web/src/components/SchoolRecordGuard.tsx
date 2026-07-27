import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/primitives';
import { SCHOOL_RECORD_BLOCKED_EVENT } from '../api/client';

/**
 * 생기부 가드 UI (지시서 §4) — 업로드 영역 상시 안내(§4-a) + 차단 모달(§4-b).
 * 조문 표기("제25조의2")는 법률 자문 후 확정 치환 대상(지시서 §4 주석).
 */

/** §4-a 업로드 영역 상시 안내 문구(단일 출처). */
export const SCHOOL_RECORD_NOTICE =
  '학교생활기록부(생기부)는 업로드할 수 없습니다. 관련 법령(생활기록부 관련 법령 제25조의2, 2026. 7. 29. 시행)에 ' +
  '따라 학원·교습소 등은 학생의 동의가 있어도 생활기록부를 제공받거나 이용할 수 없습니다. ' +
  '생활기록부가 포함된 파일은 자동으로 차단·삭제되며 저장되지 않습니다.';

/**
 * §4-a 상시 안내 — 모든 업로드 영역 하단에 고정.
 * compact: 툴바 등 좁은 영역용(줄임 문구).
 */
export function SchoolRecordUploadNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p
      role="note"
      style={{
        margin: compact ? '4px 0 0' : '6px 0 0',
        padding: compact ? '5px 8px' : '7px 10px',
        fontSize: 12,
        lineHeight: 1.5,
        color: 'var(--chip-confirmed, #8a6d3b)',
        background: 'var(--chip-confirmed-bg, #FAF1E2)',
        border: '1px solid var(--chip-confirmed, #e6d3ad)',
        borderRadius: 8,
      }}
    >
      📋 <strong>학교생활기록부(생기부)는 업로드할 수 없습니다.</strong>{' '}
      {compact
        ? '관련 법령(제25조의2)에 따라 자동 차단·삭제되며 저장되지 않습니다.'
        : '관련 법령(제25조의2, 2026. 7. 29. 시행)에 따라 학생 동의가 있어도 생활기록부를 제공받을 수 없으며, 포함된 파일은 자동 차단·삭제되고 저장되지 않습니다.'}
    </p>
  );
}

/**
 * §4-b 차단 모달 — 앱 루트에 1회 마운트. api 클라이언트가 SR_* 응답 시 발생시키는
 * 전역 이벤트를 수신해 표시한다. SR_UNSURE 는 이의(문의) 경로를 강조.
 */
export function SchoolRecordBlockModal() {
  const [state, setState] = useState<{ open: boolean; code?: string; message?: string }>({ open: false });

  useEffect(() => {
    const onBlocked = (e: Event) => {
      const detail = (e as CustomEvent<{ code?: string; message?: string }>).detail;
      setState({ open: true, code: detail?.code, message: detail?.message });
    };
    window.addEventListener(SCHOOL_RECORD_BLOCKED_EVENT, onBlocked);
    return () => window.removeEventListener(SCHOOL_RECORD_BLOCKED_EVENT, onBlocked);
  }, []);

  const close = () => setState({ open: false });
  const unsure = state.code === 'SR_UNSURE';
  // 컨설팅 접수 신규 생기부 업로드 정책 차단(§4-d) — 내용 감지가 아니라 정책 거부. 서버 문구를 그대로 표시.
  const consultingDisabled = state.code === 'SR_CONSULTING_DISABLED';

  return (
    <Modal
      open={state.open}
      onClose={close}
      title="⛔ 업로드할 수 없는 파일입니다"
      footer={
        <Button variant="primary" onClick={close}>
          확인
        </Button>
      }
    >
      <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
        {consultingDisabled ? (
          <p>
            {state.message ??
              '관련 법령(제25조의2, 2026. 7. 29. 시행)에 따라 컨설팅 접수에서도 학교생활기록부(생기부)를 신규로 제공받을 수 없습니다.'}
          </p>
        ) : unsure ? (
          <p>
            첨부하신 파일이 <strong>학교생활기록부</strong>일 가능성이 있어 보수적으로 차단되었습니다.
            관련 법령(제25조의2)에 따라 저희 서비스는 생활기록부를 제공받을 수 없으며,{' '}
            <strong>해당 파일은 저장되지 않았습니다.</strong>
          </p>
        ) : (
          <p>
            첨부하신 파일에서 <strong>학교생활기록부</strong>로 판단되는 내용이 확인되었습니다.
            관련 법령(제25조의2)에 따라 저희 서비스는 생활기록부를 제공받을 수 없으며,{' '}
            <strong>해당 파일은 저장되지 않고 즉시 삭제되었습니다.</strong>
          </p>
        )}
        <p style={{ marginTop: 10 }}>
          질문·상담에 필요한 내용이 성적·과목 정보라면 생활기록부 원본 대신{' '}
          <strong>①직접 입력</strong> 또는 <strong>②성적표(모의고사·내신 성적통지표) 업로드</strong>를 이용해 주세요.
        </p>
        <p style={{ marginTop: 10, color: 'var(--muted)' }}>
          생활기록부가 아닌데 차단되었다면 <strong>문의하기</strong>로 알려주세요. 확인 후 도와드리겠습니다.
        </p>
      </div>
    </Modal>
  );
}
