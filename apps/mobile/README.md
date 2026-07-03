# 멘토링 플랫폼 — 모바일 (학생·학부모)

Expo SDK 51 + React Native + TypeScript. 학생/학부모 역할을 `/me`로 판별해 화면을 분기합니다.

## 사전 준비
- Node 20+, npm 10+
- 실행 방법 중 하나
  - **iOS 시뮬레이터**(Xcode) / **Android 에뮬레이터**(Android Studio)
  - 실기기 + **Expo Go** 앱(App Store/Play Store)
- 백엔드 API가 떠 있어야 함 (루트에서 `npm run infra:up && npm run api:dev`)

## 설치
```bash
# 레포 루트에서 (워크스페이스 일괄 설치)
npm install
```

## API 주소 설정 (중요)
`app.json` → `expo.extra.apiBase` 가 API 베이스 URL입니다(기본 `http://localhost:3000/api/v1`).

- **iOS 시뮬레이터 / 웹**: `localhost` 그대로 동작.
- **Android 에뮬레이터**: `http://10.0.2.2:3000/api/v1` 로 변경(에뮬레이터→호스트).
- **실기기(Expo Go)**: 같은 Wi‑Fi에서 **개발 PC의 LAN IP** 사용 → `http://192.168.x.x:3000/api/v1`.
  - 백엔드 CORS는 기본 전체 허용(local), 별도 설정 불필요.

```jsonc
// app.json
"extra": { "apiBase": "http://192.168.0.10:3000/api/v1" }
```

## 실행
```bash
cd apps/mobile
npm start          # expo 개발 서버
# 터미널에서:  i (iOS 시뮬)  ·  a (Android)  ·  QR 스캔(Expo Go)
npm run typecheck  # tsc --noEmit (런타임 없이 타입 검증)
```

## 더미 계정 (로컬 시드)
| 역할 | 아이디 | 비밀번호 |
|---|---|---|
| 학생 | `student01` | `dev-password!` |
| 학부모 | `guardian01` | `dev-password!` |

## 화면 흐름
- **학생**: 선생님 찾기 → 슬롯 선택 → 요금(quote) → 예약(크레딧 부족 시 안내) · 크레딧 잔액/모의 충전
- **학부모**: 자녀 연결 신청(학생 아이디) → 자녀 상담기록 열람(공개분만) · 결제요청 대납 결제

## 참고 / 한계
- **자녀 연결 승인**: 학부모가 신청하면 `pending` 상태이며, **학생 본인 또는 관리자 승인** 후 연결됩니다.
  현재 모바일에 학생용 승인 화면은 없으므로, 데모 시 승인은 API로 처리하세요:
  ```bash
  # 학생(student01) 토큰으로 링크 승인
  curl -X PATCH http://localhost:3000/api/v1/guardian/links/<linkId>/respond \
    -H "Authorization: Bearer <student-access-token>" \
    -H 'Content-Type: application/json' -d '{"action":"approve"}'
  ```
- 학부모 결제요청은 예약 크레딧 부족(자동 생성)·관리자/학생 발행 건이 목록에 뜹니다.
- 이 저장소 CI 환경에서는 시뮬레이터가 없어 런타임 구동 대신 `npm run typecheck`로 검증합니다.
