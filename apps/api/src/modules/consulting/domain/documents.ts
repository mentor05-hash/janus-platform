// 컨설팅 업로드 자료 형식 검증 (순수 함수) — 설계안 §2 / 정책: PDF·Word만 허용
// 생기부 등 민감자료. 형식 화이트리스트 + 크기 제한. 실제 악성 스캔은 후속(scan_status).

export const ALLOWED_DOC_MIMES = [
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
] as const;

export const ALLOWED_DOC_EXTS = ['.pdf', '.doc', '.docx'] as const;

export const MAX_DOC_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export function isAllowedDocMime(mime: string): boolean {
  return (ALLOWED_DOC_MIMES as readonly string[]).includes(mime);
}

export function isAllowedDocName(name: string): boolean {
  const lower = (name ?? '').toLowerCase();
  return ALLOWED_DOC_EXTS.some((ext) => lower.endsWith(ext));
}

export interface DocFileMeta {
  originalname: string;
  mimetype: string;
  size: number;
}

export interface DocValidation {
  ok: boolean;
  reason?: string;
}

// mime 또는 확장자 중 하나라도 허용 목록에 있어야 통과(브라우저별 mime 편차 대비), 크기 초과는 거부.
export function validateDocument(file: DocFileMeta): DocValidation {
  if (!file || !file.size) {
    return { ok: false, reason: '업로드할 파일이 없습니다.' };
  }
  const mimeOk = isAllowedDocMime(file.mimetype);
  const nameOk = isAllowedDocName(file.originalname);
  if (!mimeOk && !nameOk) {
    return { ok: false, reason: '허용되지 않는 형식입니다. PDF 또는 Word(.doc/.docx) 파일만 업로드할 수 있습니다.' };
  }
  if (file.size > MAX_DOC_SIZE_BYTES) {
    return { ok: false, reason: '파일이 너무 큽니다. 최대 20MB까지 업로드할 수 있습니다.' };
  }
  return { ok: true };
}
