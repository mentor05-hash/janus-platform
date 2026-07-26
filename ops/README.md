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
postgres 컨테이너를 `pg_dump` 하여 `~/itall-backups/`에 gzip 저장(최근 14개 유지).
```bash
./ops/backup-db.sh
# 매일 새벽 3시 크론 예:
# 0 3 * * *  "/절대경로/ops/backup-db.sh"
```

## 오프사이트 백업 (`backup-offsite.sh`)
`backup-db.sh` 결과를 **AES256 암호화 후** S3 호환 스토리지(Cloudflare R2 등)로 올린다.
결제·PII 가 들어가는 DB 이므로 업로드 전 암호화는 선택이 아니다 — `BACKUP_PASSPHRASE` 가 없으면 업로드를 **하지 않는다**(로컬 백업은 유지).
```bash
# 필요 ENV (자격증명은 파일에 적지 않는다 — CLAUDE.md §4)
export BACKUP_PASSPHRASE=…            # 없으면 업로드 생략
export S3_BUCKET=janus-backups
export S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
export AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=…
./ops/backup-offsite.sh
# 크론 예: 0 4 * * *  "/절대경로/ops/backup-offsite.sh"   (backup-db.sh 는 03시)
```
- ENV·`gpg`·`aws` 중 하나라도 없으면 **건너뛰고 정상 종료**한다(크론이 매일 실패 알림을 쏘지 않게). 현재는 R2 미개설이라 이 상태다.
- 업로드 후 `head-object` 로 원격 크기를 대조해 검증한다(`cp` 성공만 믿지 않는다).
- 원격 보존은 최근 30개. 장기 보관이 필요해지면 **버킷 수명주기 규칙**으로 옮긴다(스크립트가 삭제를 책임지면 스크립트가 안 돌 때 무한 증가).
- ⚠ **암구호를 잃으면 백업 전량이 복호 불가**다. 기기와 다른 곳에 보관한다(그러지 않으면 오프사이트의 의미가 없다).

## DB 복구 + 리허설 (`restore-db.sh`)
백업(.sql.gz)을 복원. 파괴적이라 DB명 입력 확인을 요구(`--yes` 로 생략).
```bash
./ops/restore-db.sh ~/itall-backups/itall-YYYYMMDD-HHMMSS.sql.gz
```
**복구 리허설(주 1회 — 일요일 주간 리뷰에 포함)**: 최신 백업을 별도 DB로 복원해 실제로 되살아나는지 검증.
```bash
RESTORE_DB=itall_restore_test ./ops/restore-db.sh <최신백업> --yes
# 검증 카운트(accounts/bookings/credit_accounts)가 0이 아니면 정상. 끝나면 DROP DATABASE.
```
8단계 절차·통과 기준·증빙 칸·실패 대응표는 **`docs/20_exec/복구_리허설_체크리스트_v1_2026-07-26.md`** 에 있다.
복원해 본 적 없는 백업은 백업이 아니므로, 회차 기록을 그 문서에 남긴다.

## 터널 재부팅 자동시작 (`com.janus.tunnels.plist`) — **미설치 상태**
터널 감시자는 `~/mentoring-tunnels/run.sh`(nohup)로 떠 있어 세션을 닫아도 유지되지만
**재부팅하면 멈춘다 → 외부 접속이 끊긴다.** plist 템플릿을 repo 에 두었으니(`ops/com.janus.tunnels.plist`) 설치만 하면 된다.
```bash
# 홈 경로 치환 후 설치 (템플릿이 repo 안에 있으므로 외부 파일에 의존하지 않는다)
sed "s#REPLACE_HOME#$HOME#g" ops/com.janus.tunnels.plist > ~/Library/LaunchAgents/com.janus.tunnels.plist
launchctl load ~/Library/LaunchAgents/com.janus.tunnels.plist
launchctl list | grep com.janus.tunnels   # 등록 확인
```
- 로그인 시 시작 + 비정상 종료 시 자동 재시작(재시작 폭주는 `ThrottleInterval` 10초로 억제).
- 로그: `~/mentoring-tunnels/launchd.{out,err}.log`.
- 토큰·URL 은 plist 에 넣지 않는다 — 감시자 스크립트가 자기 설정/ENV 에서 읽는다.
- **명명 터널(고정 도메인)로 전환하면 이 항목의 성격이 바뀐다**(URL 이 안 바뀜) — B014 와 함께 재검토.
- 해제: `launchctl unload ~/Library/LaunchAgents/com.janus.tunnels.plist`
- run.sh 에 단일 인스턴스 가드가 있어, 이미 감시자가 돌고 있으면 중복 실행되지 않습니다(현재 터널 URL 보존).
- 재부팅 후 새 터널이 뜨면 URL 이 바뀌며, `~/mentoring-tunnels/links.sh` 로 최신 링크를 확인합니다.
- 해제: `launchctl unload ~/Library/LaunchAgents/com.mentoring.tunnels.plist`
