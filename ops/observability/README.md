# 관측성 스택 (Prometheus + Grafana)

API·rooms 가 노출하는 `/metrics`(prom-client)를 수집·시각화·경보한다.

## 기동
```bash
# 1) 메인 스택(네트워크 janus-platform_default 생성)
COMPOSE_PROJECT_NAME=janus-platform docker compose -f docker-compose.full.yml up -d
# 2) 관측성 스택(그 네트워크에 조인)
docker compose -f docker-compose.observability.yml up -d
```
- Prometheus: http://localhost:9090 (Status→Targets 에서 api/rooms `up` 확인)
- Grafana: http://localhost:3001 (admin/admin) — Prometheus 데이터소스 자동 프로비저닝

## 스크레이프 대상
| job | 경로 |
|---|---|
| janus-api | `api:3000/api/v1/metrics` |
| janus-rooms | `realtime-rooms:3100/api/rt/v1/metrics` |

## 주요 지표
- `http_requests_total`{method,route,status} · `http_request_duration_seconds`(히스토그램) · `app_errors_total`
- `nodejs_*` / `process_*`(기본 지표 — CPU·메모리·GC·이벤트루프)

## 알림 규칙 (`alerts.yml`)
- **TargetDown**: 스크레이프 대상 2분 다운
- **HighErrorRate**: `app_errors_total` 증가율 > 0.5/s (5m)
- **HighRequestLatencyP95**: p95 요청지연 > 1s (10m)
- **EventLoopLagHigh**: Node 이벤트루프 지연 > 0.2s

**Alertmanager**(http://localhost:9093) 포함 — Prometheus 가 여기로 경보 전송(그룹핑·억제). 통지 채널은 미구성(`alertmanager.yml` receivers 에 slack/webhook 추가 시 실통지).

## 대시보드
Grafana 에 **"Janus — API Overview"** 자동 프로비저닝(Dashboards → Janus 폴더). 패널: 서비스 up·요청량(route)·p95 지연·에러율·이벤트루프·메모리.
추가는 `grafana/provisioning/dashboards/*.json` 에 넣으면 30초 내 반영.

## 프로덕션 전환 시
- retention(`--storage.tsdb.retention.time`) · 원격쓰기(remote_write) 로 장기보관(Thanos/Mimir)
- Grafana admin 비밀번호 시크릿화, 익명 접근 차단
- Alertmanager + 통지 채널(Slack/PagerDuty)
