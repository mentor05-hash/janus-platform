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

## DB 복구 + 리허설 (`restore-db.sh`)
백업(.sql.gz)을 복원. 파괴적이라 DB명 입력 확인을 요구(`--yes` 로 생략).
```bash
./ops/restore-db.sh ~/itall-backups/itall-YYYYMMDD-HHMMSS.sql.gz
```
**복구 리허설(정기 권장)**: 최신 백업을 별도 DB로 복원해 실제로 되살아나는지 검증.
```bash
RESTORE_DB=itall_restore_test ./ops/restore-db.sh <최신백업> --yes
# 검증 카운트(accounts/bookings/credit_accounts)가 0이 아니면 정상. 끝나면 DROP DATABASE.
```

## 데모 터널 재부팅 자동시작 (선택)
현재 터널 감시자는 `~/itall-tunnels/run.sh`(nohup)로 떠 있어 세션을 닫아도 유지되지만
**컴퓨터를 재부팅하면 멈춥니다.** 재부팅에도 자동 시작하려면 LaunchAgent 등록:
```bash
# 홈 경로 치환 후 설치
sed "s#REPLACE_HOME#$HOME#g" ~/itall-tunnels/com.itall.tunnels.plist > ~/Library/LaunchAgents/com.itall.tunnels.plist
launchctl load ~/Library/LaunchAgents/com.itall.tunnels.plist
```
- run.sh 에 단일 인스턴스 가드가 있어, 이미 감시자가 돌고 있으면 중복 실행되지 않습니다(현재 터널 URL 보존).
- 재부팅 후 새 터널이 뜨면 URL 이 바뀌며, `~/itall-tunnels/links.sh` 로 최신 링크를 확인합니다.
- 해제: `launchctl unload ~/Library/LaunchAgents/com.itall.tunnels.plist`
