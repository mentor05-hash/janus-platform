-- =====================================================================
-- 0006 — stored_file (§10 StorageProvider, a1)
-- 업로드 파일 메타 + 소유권. 실제 바이트는 StorageProvider(로컬디스크/S3)에 저장.
-- =====================================================================

CREATE TABLE IF NOT EXISTS stored_file (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  storage_key  TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stored_file_owner ON stored_file(owner_id);
