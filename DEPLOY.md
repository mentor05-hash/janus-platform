# 잇올 멘토링 — 실행/배포 (기능 연동 검증)

세 가지 형태로 제공합니다. 데이터는 더미(시뮬레이션 86명)이며 공유 안전합니다.
**공통 비밀번호:** 시뮬 계정 `Itall-2026!` · 기본 더미(student01 등) `dev-password!`

## 1) 공개 링크 (즉시 접속) — 역할별 2개
Docker 스택(2번)을 cloudflared 로 공개합니다(임시 quick tunnel — 세션 종료 시 만료).
- **관리자·선생님(웹, 8080):** WEB 터널 URL
- **학생·학부모(모바일, 8090):** MOBILE 터널 URL
```bash
# 스택 기동 후(2번 참고):
cloudflared tunnel --url http://localhost:8080   # 웹  → trycloudflare URL
cloudflared tunnel --url http://localhost:8090   # 모바일 → trycloudflare URL
```
- 두 origin 모두 nginx 가 `/api` 를 api 컨테이너로 프록시 → 같은 백엔드/DB 공유.
- localtunnel 은 비밀번호 페이지·잦은 단절로 비권장. cloudflared 사용.

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
**웹 형태(권장, 위 1·2번에 포함):** expo-web 정적 export 를 nginx(`mobile` 컨테이너, 8090)로 서빙.
브라우저(모바일/PC)에서 바로 접속 — 설치 불필요. `/api` 프록시로 같은 백엔드 사용.
```bash
# 재빌드가 필요할 때(앱 소스 변경 후): export + meta 주입을 한 번에
npm run export:web --workspace apps/mobile        # → apps/mobile/dist (API=/api/v1)
docker compose -f docker-compose.full.yml build mobile && docker compose -f docker-compose.full.yml up -d mobile
```
**네이티브(Expo Go / 설치형):**
```bash
cd apps/mobile && npx expo start        # Expo Go 앱으로 QR 스캔
# 설치형 APK: EAS 빌드 — eas build -p android --profile preview
```
- 네이티브 실기기는 API 주소가 맥의 LAN IP여야 함(`app.json` extra.apiBase). 웹 export 는 `/api` 상대경로.

## 역상담(reverse) — 역할별 동선
- **선생님(웹):** 좌측 `역상담 제안` → 대상 학생을 **목록에서 선택**(UUID 입력 불필요).
  - `첫상담이 필요한 학생`(완료 0회) / `추가 역상담 가능 학생`(첫상담 진행 + 관리자 지정/학생 신청) 분리.
  - 자격 배지: 첫상담 대상 · 관리자 지정 · 학생 신청. 중복 시 작은 조합 배지("관리자 지정/학생 신청" 등).
- **관리자(웹):** 좌측 `역상담 대상` → 학생별 `역상담 지정/해제` 토글(첫상담·학생 신청 배지 함께 표시).
- **학생(모바일):** 하단 `역상담` 탭 → `선생님 역상담 제안 받기` 스위치로 직접 신청/취소.

## 주요 계정
- 마스터 `simm1` · 본사 `simhq1`·`simhq2` · 센터관리자 `simca1`(강남)·`simca2`(분당)·`simca3`(잠실)
- 선생님 `simt01`~`simt10` · 학생 `sims001`~`sims040` · 학부모 `simg001`~`simg030`
