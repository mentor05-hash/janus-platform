#!/usr/bin/env bash
# 오프사이트 백업 — backup-db.sh 결과를 암호화해 S3 호환 스토리지(Cloudflare R2 등)로 올린다.
#   사용: ./ops/backup-offsite.sh
#   크론 예: 0 4 * * *  "/절대경로/ops/backup-offsite.sh"   (backup-db.sh 는 03시, 이건 04시)
#
# 설계 근거:
#   - pg_dump 유지: restic 을 쓰면 dedup·보존정책은 얻지만 restore-db.sh(.sql.gz 전제)와
#     복원 경로가 갈린다. "백업은 되는데 복원 절차가 둘"이 더 큰 위험이라 기존 방식을 확장했다.
#   - 업로드 전 반드시 암호화: 결제·PII 가 들어가는 DB 이고 제3자 스토리지에 올라간다.
#     BACKUP_PASSPHRASE 미설정이면 오프사이트 업로드를 **하지 않는다**(로컬 백업은 유지).
#   - 자격증명은 전부 ENV. 이 파일에 값을 적지 않는다(CLAUDE.md §4).
#
# 필요 ENV:
#   BACKUP_PASSPHRASE   암호화 암구호(필수 — 없으면 업로드 생략)
#   S3_BUCKET           버킷명(필수)
#   S3_ENDPOINT         S3 호환 엔드포인트(R2 예: https://<accountid>.r2.cloudflarestorage.com)
#   S3_PREFIX           키 접두어(기본 janus/db)
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   aws CLI 표준 자격증명
#   KEEP_REMOTE         원격 보관 개수(기본 30)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="${BACKUP_DIR:-$HOME/itall-backups}"
PREFIX="${S3_PREFIX:-janus/db}"
KEEP_REMOTE="${KEEP_REMOTE:-30}"

# 1) 로컬 백업 생성(기존 스크립트 재사용 — 로테이션·검증 로직 중복 방지)
"$HERE/backup-db.sh"

LATEST="$(ls -1t "$DIR"/itall-*.sql.gz 2>/dev/null | head -1 || true)"
[ -n "$LATEST" ] || { echo "[offsite] 로컬 백업을 찾지 못했습니다 — 중단"; exit 1; }

# 2) 사전 조건 확인 — 하나라도 없으면 로컬 백업만 남기고 정상 종료(크론이 매일 실패 알림을 쏘지 않게)
missing=""
[ -n "${BACKUP_PASSPHRASE:-}" ] || missing="$missing BACKUP_PASSPHRASE"
[ -n "${S3_BUCKET:-}" ] || missing="$missing S3_BUCKET"
command -v gpg >/dev/null 2>&1 || missing="$missing gpg(미설치)"
command -v aws >/dev/null 2>&1 || missing="$missing aws-cli(미설치)"
if [ -n "$missing" ]; then
  echo "[offsite] 건너뜀 — 미구성:$missing"
  echo "[offsite] 로컬 백업은 정상 생성됨: $LATEST"
  echo "[offsite] Cloudflare R2 개설 후 ENV 를 채우면 이 스크립트가 그대로 동작합니다(백로그 B014)."
  exit 0
fi

# 3) 암호화(AES256 대칭) — 암구호는 stdin 으로만 넘긴다(프로세스 목록·히스토리 노출 방지)
ENC="$LATEST.gpg"
printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet \
  --passphrase-fd 0 --symmetric --cipher-algo AES256 -o "$ENC" "$LATEST"
echo "[offsite] 암호화 완료: $(basename "$ENC") ($(du -h "$ENC" | cut -f1))"

# 4) 업로드
KEY="$PREFIX/$(basename "$ENC")"
AWS_ARGS=(--only-show-errors)
[ -n "${S3_ENDPOINT:-}" ] && AWS_ARGS+=(--endpoint-url "$S3_ENDPOINT")
aws s3 cp "$ENC" "s3://$S3_BUCKET/$KEY" "${AWS_ARGS[@]}"
echo "[offsite] 업로드 완료: s3://$S3_BUCKET/$KEY"

# 5) 업로드 검증 — cp 성공만 믿지 않고 원격에 실제로 있는지 + 크기가 같은지 확인
REMOTE_SIZE="$(aws s3api head-object --bucket "$S3_BUCKET" --key "$KEY" \
  $([ -n "${S3_ENDPOINT:-}" ] && printf '%s %s' --endpoint-url "$S3_ENDPOINT") \
  --query ContentLength --output text 2>/dev/null || echo "")"
LOCAL_SIZE="$(wc -c < "$ENC" | tr -d ' ')"
if [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
  echo "[offsite] ✖ 검증 실패 — 원격 크기($REMOTE_SIZE) ≠ 로컬($LOCAL_SIZE)"
  exit 1
fi
echo "[offsite] 검증 통과 (${LOCAL_SIZE}바이트)"

# 6) 로컬 암호화 사본 정리(로컬엔 평문 .sql.gz 가 이미 로테이션됨 — 중복 보관 불필요)
rm -f "$ENC"

# 7) 원격 보존 정책 — 최근 $KEEP_REMOTE 개만 유지.
#    30개 = 일 1회 기준 약 한 달. 월 단위 장기 보관이 필요해지면 버킷 수명주기 규칙으로 옮긴다
#    (스크립트가 삭제를 책임지면 스크립트가 안 돌 때 무한 증가한다).
OLD="$(aws s3 ls "s3://$S3_BUCKET/$PREFIX/" \
  $([ -n "${S3_ENDPOINT:-}" ] && printf '%s %s' --endpoint-url "$S3_ENDPOINT") \
  | awk '{print $4}' | grep -E '^itall-.*\.sql\.gz\.gpg$' | sort | head -n -"$KEEP_REMOTE" || true)"
for f in $OLD; do
  aws s3 rm "s3://$S3_BUCKET/$PREFIX/$f" "${AWS_ARGS[@]}"
  echo "[offsite] 오래된 원격 백업 삭제: $f"
done

echo "[offsite] 완료. 복원: aws s3 cp s3://$S3_BUCKET/$KEY - | gpg --batch --passphrase-fd 0 -d > restore.sql.gz"
echo "[offsite] 그 다음: ./ops/restore-db.sh restore.sql.gz  (리허설은 RESTORE_DB=itall_restore_test)"
