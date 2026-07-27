# 부하 테스트

## 1. 순수 node (의존 없음 — 즉시 실행)
```bash
node ops/loadtest/loadtest.mjs http://localhost:3000/api/v1/health --conc 100 --dur 15
# 인증 엔드포인트: --token <JWT>
```
동시요청·처리량·지연 분포(p50/p95/p99)·에러율 리포트. 에러율 5% 초과 시 exit 1.

**로컬 실측(참고)**: health(DB ping 포함) 동시100/10s → **~3000 req/s · p95 ~37ms · 에러 0%**.

## 2. k6 (프로덕션 게이트용)
```bash
k6 run ops/loadtest/k6-smoke.js -e BASE=http://localhost:3000
```
램프업 후 임계(p95<500ms, 실패<1%) 초과 시 실패 종료 → CI/릴리스 게이트로 사용.

## 주의
- `/metrics`·`/health` 는 인증 불필요. 보호된 엔드포인트는 유효 JWT 필요.
- 레이트리밋(인증 라우트)에 걸릴 수 있으니 부하 대상은 읽기/헬스 위주로.
- 관측성 스택(Prometheus/Grafana) 켜두고 부하 중 지연·에러 패널로 병목 확인.
