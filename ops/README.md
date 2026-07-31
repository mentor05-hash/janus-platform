# 운영 스크립트

## 마이그레이션 러너 (`migrate.sh`)
`apps/api/migrations/*.sql` 를 **순서대로 1회씩만** 적용하고 `schema_migrations` 테이블에
이력을 기록(재실행 시 미적용분만 반영). 로컬은 postgres 컨테이너, 클라우드는 `PSQL` 로 접속 지정.
```bash
./ops/migrate.sh status      # 적용/미적용 목록
./ops/migrate.sh baseline    # 이미 수동 적용된 DB → 전 파일을 '적용됨'으로 표시(실행 안 함)
./ops/migrate.sh             # 미적용 마이그레이션만 순서대로 적용
# 클라우드 예: PSQL='psql "$DATABASE_URL"' ./ops/migrate.sh
# 적용 후 prisma client 재생성: npm run prisma:generate --workspace apps/api
```
> 신규 스키마 변경은 `migrations/NNNN_*.sql` 로 추가하고 이 러너로 적용(수동 임의 적용 금지).

## DB 백업 (`backup-db.sh`)
postgres 컨테이너를 `pg_dump` 하여 `~/janus-backups/`에 gzip 저장(최근 14개 유지).
```bash
./ops/backup-db.sh
# 매일 새벽 3시 크론 예:
# 0 3 * * *  "/절대경로/ops/backup-db.sh"
```

## DB 복구 + 리허설 (`restore-db.sh`)
백업(.sql.gz)을 복원. 파괴적이라 DB명 입력 확인을 요구(`--yes` 로 생략).
```bash
./ops/restore-db.sh ~/janus-backups/janus-YYYYMMDD-HHMMSS.sql.gz
```
**복구 리허설(정기 권장)**: 최신 백업을 별도 DB로 복원해 실제로 되살아나는지 검증.
```bash
RESTORE_DB=janus_restore_test ./ops/restore-db.sh <최신백업> --yes
# 검증 카운트(accounts/bookings/credit_accounts)가 0이 아니면 정상. 끝나면 DROP DATABASE.
```

## 오프사이트 백업 (`backup-offsite.sh`) — §2-4

> **운용 규약·위협 모델은 `docs/20_exec/야누스_백업_운용_런북_2026-07-31.md`** 에 있다 — 어떤 사본이 어떤 사고를 막는지, 외장 디스크를 왜 뽑아 둬야 하는지, `RESTIC_PASSWORD` 보관 규약, 복원 리허설 주기. 이 절은 명령 사용법만 다룬다.

`backup-db.sh` 로 DB 덤프를 새로 만든 뒤, 그 덤프 + `janus-data` + `.env` 금고를
**restic 으로 암호화**해 Cloudflare R2 로 올린다. 로컬 백업을 **대체하지 않고 위에 얹는다** —
로컬은 빠른 복구용, R2 는 기기 분실·디스크 사망·랜섬웨어 대비 오프사이트 사본이다.

```bash
./ops/backup-offsite.sh
```

자격증명은 **저장소 밖** `~/.config/janus/backup.env`(권한 600)에서만 읽는다. 커밋 금지.
필요한 키: `R2_ACCOUNT_ID` `R2_BUCKET` `AWS_ACCESS_KEY_ID` `AWS_SECRET_ACCESS_KEY` `RESTIC_PASSWORD`.

> ⚠ **`RESTIC_PASSWORD` 를 잃으면 백업을 영원히 복호화할 수 없다.** restic 은 복구 수단이
> 없다. 이 파일 하나에만 두지 말고 비밀번호 관리자에 사본을 반드시 따로 보관할 것.
> 보관했다면 **`verify-restic-password.sh` 로 그 사본이 실제로 여는지 확인**한다(아래).

보존 정책은 **일 14 · 주 8 · 월 12**(`restic forget --prune`), 매 실행 끝에 `restic check`
구조 검사를 돌린다. postgres 컨테이너가 떠 있지 않으면 DB 덤프만 건너뛰고 나머지는 백업한다.

### 일 1회 자동 실행 (launchd)

```bash
sed "s#__REPO__#$(pwd)#g" ops/launchd/com.janus.backup.plist \
  > ~/Library/LaunchAgents/com.janus.backup.plist
launchctl load ~/Library/LaunchAgents/com.janus.backup.plist
launchctl list | grep com.janus.backup   # 확인 (2번째 열이 마지막 종료코드)
```

매일 03:00 실행. 맥이 잠들어 그 시각을 놓치면 `RunAtLoad` 로 로그인 시 1회 보정한다.
로그는 저장소 밖 `~/janus/backup-offsite.log`.

### `RESTIC_PASSWORD` 사본 검증 (`verify-restic-password.sh`) — 런북 §4

비밀번호 관리자에 옮겨 적은 **사본**이 실제로 R2 저장소를 여는지 확인한다.
**대화식으로 실행하고, 관리자에서 복사한 값을 붙여넣는다** — 화면에 표시되지 않고
셸 히스토리·argv·디스크 어디에도 남지 않는다.

```bash
./ops/verify-restic-password.sh
```

> ⚠ **`backup.env` 의 값으로 `restic snapshots` 를 돌리는 것은 이 검증이 아니다.**
> 그것은 *원본*을 확인한 것이고, 원본이 동작한다는 사실은 launchd 백업이 매일 증명한다.
> 미검증인 명제는 "관리자의 사본이 원본과 같은가" 하나뿐이라, 사본을 손으로 입력해야 한다.
> 스크립트가 파일에서 읽힌 `RESTIC_PASSWORD` 를 명시적으로 `unset` 하는 이유가 이것이다 —
> 남겨 두면 무엇을 입력하든 통과하는 무의미한 의식이 된다.

판정은 `--no-cache` 로 R2 에 실제 접속해서 한다(로컬 캐시의 키 파일로 거짓 통과 방지).
실패하면 값·길이는 출력하지 않고 흔한 전사 실수의 *형태*만 알린다(앞뒤 공백·대소문자).

**이 스크립트 자체의 판별력은 양성·음성 대조로 확인돼 있다**(2026-07-31):
틀린 값 → `wrong password or no key found`(종료 12) · 원본 → 스냅샷 3개(종료 0).

### R2 복원 리허설 (§2-4 — 백업은 복원이 검증돼야 백업)

로컬 덤프가 아니라 **R2 에서 실제로 받아** 되살아나는지 확인한다. `--no-cache` 로 로컬
캐시를 우회해야 진짜 오프사이트를 검증하는 것이 된다.

```bash
set -a; . ~/.config/janus/backup.env; set +a
export RESTIC_REPOSITORY="s3:https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}"
restic restore latest --tag janus --no-cache --include "*/janus-backups/*.sql.gz" --target /tmp/r2drill
RESTORE_DB=janus_r2_restore ./ops/restore-db.sh /tmp/r2drill/**/janus-*.sql.gz --yes
# 검증 후: DROP DATABASE janus_r2_restore; rm -rf /tmp/r2drill  (실데이터라 반드시 삭제)
```

## 데모 터널 재부팅 자동시작 (선택)
현재 터널 감시자는 `~/mentoring-tunnels/run.sh`(nohup)로 떠 있어 세션을 닫아도 유지되지만
**컴퓨터를 재부팅하면 멈춥니다.** 재부팅에도 자동 시작하려면 LaunchAgent 등록:
```bash
# 홈 경로 치환 후 설치
sed "s#REPLACE_HOME#$HOME#g" ~/mentoring-tunnels/com.mentoring.tunnels.plist > ~/Library/LaunchAgents/com.mentoring.tunnels.plist
launchctl load ~/Library/LaunchAgents/com.mentoring.tunnels.plist
```
- run.sh 에 단일 인스턴스 가드가 있어, 이미 감시자가 돌고 있으면 중복 실행되지 않습니다(현재 터널 URL 보존).
- 재부팅 후 새 터널이 뜨면 URL 이 바뀌며, `~/mentoring-tunnels/links.sh` 로 최신 링크를 확인합니다.
- 해제: `launchctl unload ~/Library/LaunchAgents/com.mentoring.tunnels.plist`
