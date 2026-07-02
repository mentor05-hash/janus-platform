# 운영 스크립트

## DB 백업 (`backup-db.sh`)
postgres 컨테이너를 `pg_dump` 하여 `~/itall-backups/`에 gzip 저장(최근 14개 유지).
```bash
./ops/backup-db.sh
# 매일 새벽 3시 크론 예:
# 0 3 * * *  "/절대경로/ops/backup-db.sh"
```
복구:
```bash
gunzip -c ~/itall-backups/itall-YYYYMMDD-HHMMSS.sql.gz | docker exec -i itall-mentoring-postgres-1 psql -U itall -d itall
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
