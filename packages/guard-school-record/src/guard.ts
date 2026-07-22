import { REASON } from './reasons';
import { resolvePolicy, SCHOOL_RECORD_KEYWORDS } from './policy';
import type {
  GuardDeps,
  GuardInput,
  GuardVerdict,
  PartialSchoolRecordGuardPolicy,
  SchoolRecordGuardPolicy,
} from './types';
import type { GuardStage, ReasonCode } from './reasons';

/* ────────────────────────────────────────────────────────────────────────
 * 무취급(무영속) 불변식
 * 이 파일 어디에도 fs·DB·네트워크 쓰기 호출이 없다.
 * 바이트/텍스트는 함수 지역 스코프에서만 훑고, 반환값에는 boolean+사유만 담는다.
 * console 로깅조차 하지 않는다(내용 유출 방지).
 * ──────────────────────────────────────────────────────────────────────── */

const utf8 = new TextDecoder('utf-8', { fatal: false });

/** 매칭 정규화: 공백·가운뎃점류 제거로 서식 표기 변형을 흡수. */
function normalize(s: string): string {
  return s.replace(/[\s·ㆍ∙・‧]/g, '');
}

function pass(): GuardVerdict {
  return { blocked: false, reason: null, stage: null };
}

function block(stage: GuardStage, reason: ReasonCode): GuardVerdict {
  return { blocked: true, reason, stage };
}

function isVisualLike(mimeType?: string): boolean {
  if (!mimeType) return false;
  const m = mimeType.toLowerCase();
  return m.startsWith('image/') || m === 'application/pdf';
}

/** 인메모리 텍스트 스캔 대상이 될 만한 입력인지(이미지/PDF는 제외 → 비전 단계로). */
function isScannableText(input: GuardInput): boolean {
  if (typeof input.text === 'string') return true;
  if (!input.bytes) return false;
  const m = input.mimeType?.toLowerCase();
  // mime 미지정 또는 text/* 만 인메모리 디코딩. 바이너리(이미지/PDF)는 디코딩하지 않는다.
  return !m || m.startsWith('text/');
}

/**
 * 1단계 — 파일명 패턴.
 * 파일명을 정규화(공백 제거)한 뒤 정책 패턴과 대조한다.
 */
function checkFilename(
  filename: string | undefined,
  policy: SchoolRecordGuardPolicy,
): boolean {
  if (!filename) return false;
  const haystack = normalize(filename);
  for (const src of policy.filenamePatterns) {
    let re: RegExp;
    try {
      re = new RegExp(normalize(src), 'i');
    } catch {
      // 잘못된 정규식 소스는 건너뛴다(정책 오설정이 가드를 깨뜨리지 않게).
      continue;
    }
    if (re.test(haystack)) return true;
  }
  return false;
}

/**
 * 2단계 — 서식 키워드 임계.
 * 서로 다른 생기부 서식 키워드가 몇 개 검출되는지 센다(각 키워드 최대 1회).
 * 반환은 개수뿐 — 매칭된 원문/스니펫은 만들지도, 반환하지도 않는다.
 */
function countSignatureKeywords(text: string): number {
  const hay = normalize(text);
  if (!hay) return 0;
  let hits = 0;
  for (const kw of SCHOOL_RECORD_KEYWORDS) {
    if (hay.includes(normalize(kw))) hits += 1;
  }
  return hits;
}

/** 입력에서 인메모리 텍스트를 얻는다(영속화 없음, 지역 변수로만 존재). */
function readTextInMemory(input: GuardInput): string {
  if (typeof input.text === 'string') return input.text;
  if (input.bytes) {
    try {
      return utf8.decode(input.bytes);
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * 생기부 판정 — 3단 파이프라인(파일명 → 키워드 → 비전 훅).
 * 각 단계는 단락(short-circuit)한다: 먼저 확정되면 즉시 반환.
 *
 * @returns boolean(차단) + 사유 코드 + 단계. 원본/추출 텍스트는 포함하지 않는다.
 */
export async function inspectForSchoolRecord(
  input: GuardInput,
  policy?: PartialSchoolRecordGuardPolicy,
  deps: GuardDeps = {},
): Promise<GuardVerdict> {
  const resolved = resolvePolicy(policy);
  if (!resolved.enabled) return pass();

  // 1단계: 파일명 패턴
  if (checkFilename(input.filename, resolved)) {
    return block('filename', REASON.FILENAME);
  }

  // 2단계: 서식 키워드 임계
  if (isScannableText(input)) {
    const hits = countSignatureKeywords(readTextInMemory(input));
    if (hits >= resolved.keywordThreshold) {
      return block('keyword', REASON.KEYWORD);
    }
  }

  // 3단계: 비전 분류 훅(이미지/PDF + 정책 허용 + 분류기 주입 시에만)
  if (
    resolved.llmCheck &&
    deps.classifyImage &&
    isVisualLike(input.mimeType)
  ) {
    const v = await deps.classifyImage({
      bytes: input.bytes,
      mimeType: input.mimeType,
    });
    if (v.label === 'yes') {
      return block('vision', REASON.VISION);
    }
    if (v.label === 'unsure') {
      // §1-1 무취급 기본값: 판단이 애매하면 받지 않는다 → 차단 + 이의 안내(§4-b).
      return block('vision', REASON.UNSURE);
    }
    // v.label === 'no' → 통과
  }

  return pass();
}

/** 동기 컨텍스트를 위한 편의 판정 — 비전 단계(비동기)를 제외한 1·2단계만 수행. */
export function inspectForSchoolRecordSync(
  input: GuardInput,
  policy?: PartialSchoolRecordGuardPolicy,
): GuardVerdict {
  const resolved = resolvePolicy(policy);
  if (!resolved.enabled) return pass();

  if (checkFilename(input.filename, resolved)) {
    return block('filename', REASON.FILENAME);
  }

  if (isScannableText(input)) {
    const hits = countSignatureKeywords(readTextInMemory(input));
    if (hits >= resolved.keywordThreshold) {
      return block('keyword', REASON.KEYWORD);
    }
  }

  return pass();
}
