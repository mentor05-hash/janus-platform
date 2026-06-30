# 잇올 멘토링 — 실행/배포 (기능 연동 검증)

세 가지 형태로 제공합니다. 데이터는 더미(시뮬레이션 86명)이며 공유 안전합니다.
**공통 비밀번호:** 시뮬 계정 `Itall-2026!` · 기본 더미(student01 등) `dev-password!`

## 1) 공개 링크 (즉시 접속)
개발 서버를 터널로 공개합니다(임시 — 세션 종료 시 만료).
```bash
npm run dev --workspace apps/web -- --host   # 웹(5173) — /api 는 3000으로 프록시
npx localtunnel --port 5173                   # 공개 URL 발급
```
- 첫 접속 시 localtunnel 안내 페이지에 **tunnel password = 호스트 공개 IP** 입력.
- 관리자·선생님은 이 링크(웹)로, 학생·학부모는 모바일(아래).

## 2) Docker 설치형 스택 (어디서나 한 번에)
api + web + db + redis 전체를 컨테이너로 실행. **Docker만 있으면** 다른 PC에서도 동작.
```bash
docker compose -f docker-compose.full.yml up --build
# → http://localhost:8080   (웹. nginx 가 /api 를 api 컨테이너로 프록시)
```
- 최초 1회 `init` 서비스가 마이그레이션 + 시드(기본 + 시뮬 86명)를 수행(수 분 소요).
- 중지: `docker compose -f docker-compose.full.yml down` (데이터 보존). 초기화: `down -v`.

## 3) 웹 프로덕션 빌드 (정적 산출물)
```bash
npm run build --workspace apps/web     # → apps/web/dist  (정적 파일)
```
- `dist/`를 임의 정적 호스팅에 올리고, `/api` 를 API 서버로 프록시하면 동작(예: 위 nginx.conf).
- Docker 스택(2번)의 web 서비스가 이 빌드를 그대로 서빙합니다.

## 모바일(학생·학부모)
```bash
cd apps/mobile && npx expo start        # Expo Go 앱으로 QR 스캔(기능 검증)
# 설치형 APK 필요 시: EAS 빌드(Expo 계정) — eas build -p android --profile preview
```
- 실기기는 API 주소가 맥의 LAN IP여야 함(앱 설정 `extra.apiBase`). 시뮬레이터는 localhost.

## 주요 계정
- 마스터 `simm1` · 본사 `simhq1`·`simhq2` · 센터관리자 `simca1`(강남)·`simca2`(분당)·`simca3`(잠실)
- 선생님 `simt01`~`simt10` · 학생 `sims001`~`sims040` · 학부모 `simg001`~`simg030`
