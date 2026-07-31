#!/usr/bin/env bash
# 야누스 오프사이트 백업 — 실행계획서 §2-4.
#   ① ops/backup-db.sh 로 DB 덤프를 새로 만들고
#   ② 덤프 + janus-data + .env 금고를 restic 으로 암호화해 Cloudflare R2 로 올린다.
#
# 기존 로컬 백업(backup-db.sh)을 대체하지 않고 그 위에 얹는다 — 로컬은 빠른 복구용,
# R2 는 기기 분실·디스크 사망·랜섬웨어 대비 오프사이트 사본이다.
#
# 자격증명은 저장소 밖 ~/.config/janus/backup.env 에서만 읽는다(권한 600, 커밋 금지).
# 사용: ./ops/backup-offsite.sh
# launchd: ops/launchd/com.janus.backup.plist (매일 03:00)
set -euo pipefail

ENV_FILE="${JANUS_BACKUP_ENV:-$HOME/.config/janus/backup.env}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${JANUS_DATA_DIR_HOST:-$HOME/janus/20_data}"
DUMP_DIR="${BACKUP_DIR:-$HOME/janus-backups}"

log() { echo "[offsite] $*"; }
# 로그·오류에 계정 ID 가 섞이지 않도록 마스킹.
mask() { sed -E 's#https://[a-f0-9]{16,}\.#https://<accountid>.#g'; }

[ -f "$ENV_FILE" ] || { echo "[offsite] 자격증명 파일이 없습니다: $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

for k in R2_ACCOUNT_ID R2_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY RESTIC_PASSWORD; do
  [ -n "${!k:-}" ] || { echo "[offsite] $ENV_FILE 의 $k 가 비어 있습니다." >&2; exit 1; }
done

export RESTIC_REPOSITORY="s3:https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}"

# ── ① DB 덤프 (postgres 가 떠 있을 때만) ────────────────────────────
PG_CONTAINER="${PG_CONTAINER:-janus-platform-postgres-1}"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then
  log "DB 덤프 생성"
  "$REPO_ROOT/ops/backup-db.sh"
else
  # 컨테이너가 없다고 백업 전체를 중단하지 않는다 — 기존 덤프와 데이터는 그대로 올린다.
  log "⚠ $PG_CONTAINER 가 떠 있지 않아 DB 덤프를 건너뜁니다(기존 덤프는 그대로 백업)."
fi

# ── ② 백업 대상 수집 ────────────────────────────────────────────────
TARGETS=()
[ -d "$DUMP_DIR" ] && TARGETS+=("$DUMP_DIR")
[ -d "$DATA_DIR" ] && TARGETS+=("$DATA_DIR")
# .env 금고 — 저장소에 있지만 커밋되지 않는 실 파일들(§1-2). 없으면 조용히 건너뛴다.
for f in "$REPO_ROOT/.env" "$REPO_ROOT/.env.bak" "$REPO_ROOT/apps/api/.env" "$ENV_FILE"; do
  [ -f "$f" ] && TARGETS+=("$f")
done
[ ${#TARGETS[@]} -gt 0 ] || { echo "[offsite] 백업할 대상이 없습니다." >&2; exit 1; }

log "대상 ${#TARGETS[@]}건 → R2/${R2_BUCKET}"
restic backup --tag janus --host janus-mac "${TARGETS[@]}" 2>&1 | mask

# ── ③ 보존 정책 + 정리 ──────────────────────────────────────────────
# 일 14 / 주 8 / 월 12 — 복원 시점 선택지를 남기되 무료 한도(10GB) 안에서 관리.
log "보존 정책 적용(일14·주8·월12)"
restic forget --tag janus --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune 2>&1 | mask

# ── ④ 구조 무결성 검사 ──────────────────────────────────────────────
# 매 실행은 구조 검사만(저렴). 데이터 블록 전수 검증은 주간 리뷰에서 --read-data 로.
log "무결성 검사"
restic check 2>&1 | mask

log "완료 — 스냅샷 $(restic snapshots --tag janus --json 2>/dev/null | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' 2>/dev/null || echo '?')개"
