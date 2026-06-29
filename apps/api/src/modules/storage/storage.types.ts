/**
 * StorageProvider 어댑터 인터페이스 (CLAUDE.md §10).
 * 로컬은 디스크 실저장, 클라우드는 S3/Cloud Storage 구현으로 교체(코드 변경 없이 ENV 전환).
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface PutInput {
  /** 저장 키(경로). 예: uploads/{uuid}. 호출측이 충돌 없는 키를 생성. */
  key: string;
  data: Buffer;
  contentType: string;
}

export interface StorageProvider {
  put(input: PutInput): Promise<{ key: string }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** 컨트롤러에서 multer 파일을 받기 위한 최소 형태(@types/multer 의존 회피). */
export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}
