#!/usr/bin/env bash
# RESTIC_PASSWORD 사본 검증 — 백업 운용 런북 §4 · 정기 점검 §6.
#
# 무엇을 검증하는가: **비밀번호 관리자에 보관한 사본**이 실제로 R2 저장소를 여는지.
#
# ⚠ 왜 backup.env 의 값을 쓰면 안 되는가 —
#   그 파일의 RESTIC_PASSWORD 로 restic 을 열면 '원본'을 검증한 것이다. 원본이 동작한다는
#   사실은 launchd 백업이 매일 증명하고 있으므로 새로 알아낼 것이 없다. 미검증으로 남아 있는
#   명제는 오직 하나 — "관리자에 옮겨 적은 사본이 원본과 같은가". 그래서 이 스크립트는
#   사본을 사람에게 직접 입력받고, 파일에서 읽힌 RESTIC_PASSWORD 는 즉시 지운다.
#   (잘못 옮겨 적은 암호는 없는 것보다 나쁘다 — 있다고 믿게 만들기 때문이다.)
#
# 비밀은 화면에 표시되지 않고, 셸 히스토리·argv·디스크 어디에도 남지 않는다.
#
# 사용: ./ops/verify-restic-password.sh
# 종료코드: 0 = 사본으로 저장소가 열림 · 1 = 열리지 않음(또는 선행 조건 미충족)
set -euo pipefail

ENV_FILE="${JANUS_BACKUP_ENV:-$HOME/.config/janus/backup.env}"

log()  { echo "[verify] $*"; }
# 로그·오류에 R2 계정 ID 가 섞이지 않도록 마스킹(backup-offsite.sh 와 동일 규약).
mask() { sed -E 's#https://[a-f0-9]{16,}\.#https://<accountid>.#g'; }

[ -f "$ENV_FILE" ] || { echo "[verify] 자격증명 파일이 없습니다: $ENV_FILE" >&2; exit 1; }
command -v restic >/dev/null || { echo "[verify] restic 이 설치돼 있지 않습니다." >&2; exit 1; }

# R2 좌표·S3 자격증명은 파일에서 읽는다(검증 대상이 아니다).
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

for k in R2_ACCOUNT_ID R2_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [ -n "${!k:-}" ] || { echo "[verify] $ENV_FILE 의 $k 가 비어 있습니다." >&2; exit 1; }
done

# ── 원본을 손에 쥔 뒤 환경에서 제거한다 ────────────────────────────────
# 이 unset 이 이 스크립트의 핵심이다. 남겨 두면 restic 이 사본이 아니라 원본으로 열어
# 버리고, 검증은 '항상 통과'하는 무의미한 의식이 된다(= 대상을 빗나간 검증).
ORIGINAL="${RESTIC_PASSWORD:-}"
unset RESTIC_PASSWORD

export RESTIC_REPOSITORY="s3:https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}"

# ── 사본 입력 ───────────────────────────────────────────────────────────
# IFS= 로 앞뒤 공백을 보존한다 — 붙여넣기에 딸려 온 공백은 실제 실패 원인이므로
# 여기서 조용히 다듬으면 검증이 거짓 통과한다.
if [ -t 0 ]; then
  printf '비밀번호 관리자에 보관한 사본을 붙여넣고 Enter (화면에 표시되지 않습니다): ' > /dev/tty
  IFS= read -rs COPY < /dev/tty
  printf '\n' > /dev/tty
else
  # 비대화식 — 자체 시험용(틀린 값을 넣어 이 스크립트가 실제로 걸러내는지 확인).
  # 실제 검증은 반드시 대화식으로 한다. 파이프로 넘기면 값이 히스토리·프로세스 목록에 남는다.
  log "⚠ 비대화식 입력 — 자체 시험 모드로 간주합니다."
  # `|| true` 필수: 개행 없이 끝나는 입력에서 read 는 값을 채우고도 non-zero 를 낸다.
  # set -e 와 만나면 여기서 조용히 죽어 검증이 '실행되지 않은 채' 끝난다.
  IFS= read -r COPY || true
fi

[ -n "$COPY" ] || { echo "[verify] 입력이 비어 있습니다 — 중단합니다." >&2; exit 1; }

# ── ① 원본과 대조 (오프라인 — 실패 시 원인 국소화용) ────────────────────
DIAG=""
if [ -n "$ORIGINAL" ]; then
  if [ "$COPY" = "$ORIGINAL" ]; then
    log "사본 = 원본 (파일 대조 일치)"
  else
    log "⚠ 사본이 원본과 다릅니다."
    # 값·길이는 절대 출력하지 않는다. 흔한 전사 실수의 '형태'만 알린다.
    [ "$COPY" != "${COPY#[[:space:]]}" ] && DIAG="$DIAG 앞에_공백"
    [ "$COPY" != "${COPY%[[:space:]]}" ] && DIAG="$DIAG 끝에_공백/개행"
    # shellcheck disable=SC2019,SC2018
    if [ "$(printf %s "$COPY" | tr 'A-Z' 'a-z')" = "$(printf %s "$ORIGINAL" | tr 'A-Z' 'a-z')" ]; then
      DIAG="$DIAG 대소문자만_다름"
    fi
    [ -n "$DIAG" ] && log "  힌트:$DIAG"
  fi
else
  log "⚠ $ENV_FILE 에 RESTIC_PASSWORD 가 없어 파일 대조는 건너뜁니다(저장소 열기로만 판정)."
fi

# ── ② 실제로 저장소가 열리는지 (판정) ───────────────────────────────────
# --no-cache: 로컬 restic 캐시의 키 파일로 통과해 버리면 R2 를 검증한 것이 아니다(런북 §5).
log "R2 저장소 열기 시도 (--no-cache)"
set +e
RESTIC_PASSWORD="$COPY" restic snapshots --tag janus --no-cache 2>&1 | mask
STATUS=${PIPESTATUS[0]}
set -e

unset COPY ORIGINAL RESTIC_PASSWORD

if [ "$STATUS" -eq 0 ]; then
  log "✅ 통과 — 관리자에 보관된 사본으로 저장소가 열립니다."
  log "   런북 §4 의 단일 실패점이 실측으로 닫혔습니다."
else
  log "❌ 실패 — 이 사본으로는 저장소가 열리지 않습니다 (restic 종료코드 $STATUS)."
  log "   백업은 R2 에 있으나 이 값으로는 복호화할 수 없습니다."
  log "   ~/.config/janus/backup.env 의 원본을 관리자에 다시 옮겨 적고 이 스크립트를 재실행하세요."
fi
exit "$STATUS"
