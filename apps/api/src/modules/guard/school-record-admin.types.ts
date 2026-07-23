/**
 * 생기부 가드 관리 계층 공용 상수·타입 (지시서 §6 스텝3).
 * 무취급 원칙(§1-2): 여기서 다루는 것은 사유 코드·표면 라벨 등 **메타데이터**뿐이며,
 * 파일명·추출 텍스트·원본 바이트는 어떤 경로로도 취급하지 않는다.
 */

/** 차단이 발생한 경로(집계 2차 축). 표면 라벨만 기록한다. */
export const GUARD_SURFACE = {
  /** storage 초크포인트 경유 일반 업로드(Q&A 첨부·채팅 이미지·화이트보드 배경 등). */
  UPLOAD: 'upload',
  /** 성적표 OCR(§5 3단 비전). */
  SCORES_OCR: 'scores_ocr',
  /** 컨설팅 접수 자료 업로드. */
  CONSULTING_INTAKE: 'consulting_intake',
  /** 상담 승격 이관 재판정. */
  QNA_ESCALATION: 'qna_escalation',
  UNKNOWN: 'unknown',
} as const;
export type GuardSurface = (typeof GUARD_SURFACE)[keyof typeof GUARD_SURFACE];

/**
 * 정책(비-감지) 차단 사유 — 순수 모듈의 ReasonCode(SR_*, 내용 감지)와 별개.
 * 컨설팅 업로드 토글에 의한 정책 거부를 집계에서 구분하기 위한 코드.
 */
export const POLICY_REASON = {
  CONSULTING_UPLOAD_DISABLED: 'CONSULTING_UPLOAD_DISABLED',
} as const;

/** system_setting 키 — 컨설팅 신규 생기부 업로드 비활성 토글(런타임 가변, 요청 시 조회). */
export const CONSULTING_UPLOAD_DISABLED_KEY = 'guard.schoolRecord.consultingUploadDisabled';

/** 토글이 자동 활성되는 법령 시행 시각(지시서 §2 컨설팅 행 · 제25조의2, 2026-07-29 00:00 KST). */
export const DEFAULT_ACTIVATION_AT = '2026-07-29T00:00:00+09:00';

/** system_setting.value 에 저장되는 토글 값. */
export interface ConsultingToggleValue {
  /** true = 신규 생기부(student_record) 업로드 차단. */
  enabled: boolean;
  /** 마지막 변경 출처. */
  source: 'manual' | 'scheduler' | 'default';
  /** 스케줄 자동 활성 시각(ISO). 설정되면 스케줄러는 재발화하지 않는다(이후 수동 off 존중). */
  autoActivatedAt: string | null;
  /** 수동 변경한 관리자 계정 id. */
  updatedBy: string | null;
  /** 마지막 변경 시각(ISO). */
  updatedAt: string | null;
}

/** 조회 응답(저장값 + 파생 메타). */
export interface ConsultingToggleState extends ConsultingToggleValue {
  /** 저장 행이 없어 기본값(비활성)으로 응답 중인지. */
  isDefault: boolean;
  /** 자동 활성 예약 시각(ISO). */
  activationAt: string;
}
