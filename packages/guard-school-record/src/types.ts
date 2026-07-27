import type { GuardStage, ReasonCode } from './reasons';

/**
 * 가드 입력. 판정 함수는 **버퍼(바이트)** 를 받아 메모리 안에서만 훑는다.
 * 어떤 필드도 파일·DB·로그 등 외부 경로로 영속화하지 않는다(무취급 원칙).
 *
 * - `bytes`: 원본 바이트. Node의 `Buffer`도 `Uint8Array` 하위형이라 그대로 전달 가능.
 * - `text`: 호출측이 이미 추출한 텍스트(PDF/DOCX 등). 메모리 상에서만 스캔된다.
 * - `filename`/`mimeType`: 라우팅용 메타데이터.
 */
export interface GuardInput {
  filename?: string;
  mimeType?: string;
  bytes?: Uint8Array;
  text?: string;
}

/**
 * 정책 스키마 — `guard.schoolRecord.*`.
 * 모두 서버 정책값으로 주입되며, 코드에는 안전한 기본값만 둔다.
 */
export interface SchoolRecordGuardPolicy {
  /** guard.schoolRecord.enabled — 가드 자체 on/off. */
  enabled: boolean;
  /** guard.schoolRecord.filenamePatterns — 파일명 매칭 정규식 소스 문자열 목록. */
  filenamePatterns: string[];
  /** guard.schoolRecord.keywordThreshold — 차단에 필요한 '서로 다른' 서식 키워드 최소 개수. */
  keywordThreshold: number;
  /** guard.schoolRecord.llmCheck — 이미지/스캔 문서에 대한 비전 분류 단계 허용 여부. */
  llmCheck: boolean;
}

/** 정책의 부분 지정(주입 시 기본값 위에 병합). */
export type PartialSchoolRecordGuardPolicy = Partial<SchoolRecordGuardPolicy>;

/** 비전 분류기에 넘기는 프로브(바이트 + mime). 분류기 호출·보존 책임은 어댑터(호출측)에 있다. */
export interface VisionProbe {
  bytes?: Uint8Array;
  mimeType?: string;
}

/**
 * 비전 분류 결과 라벨 — §5 3단의 분류 프롬프트
 * ("이 이미지가 학교생활기록부 서식인가? yes/no/unsure")에 그대로 대응.
 * - `yes`   → 생기부로 확신 → 차단(SR_VISION)
 * - `no`    → 생기부 아님 → 통과
 * - `unsure`→ 판단 유보 → 무취급 기본값에 따라 **차단**(SR_UNSURE) + 이의 안내
 */
export type VisionLabel = 'yes' | 'no' | 'unsure';

/** 비전 분류 결과. 응답은 라벨만 — 원문/근거 텍스트는 담지 않는다. */
export interface VisionResult {
  label: VisionLabel;
}

/** 비전 분류기(의존성 주입). LlmProvider 어댑터 뒤에 두는 것을 전제로 한다. */
export type VisionClassifier = (probe: VisionProbe) => Promise<VisionResult>;

/** 가드에 주입하는 의존성. */
export interface GuardDeps {
  classifyImage?: VisionClassifier;
}

/**
 * 판정 결과 — **boolean + 사유만**.
 * 원본/추출 텍스트를 담지 않는다.
 */
export interface GuardVerdict {
  /** 차단 여부. */
  blocked: boolean;
  /** 사유 코드(판단 근거 없음이면 null). */
  reason: ReasonCode | null;
  /** 판정을 결정지은 단계(메타데이터). */
  stage: GuardStage | null;
}
