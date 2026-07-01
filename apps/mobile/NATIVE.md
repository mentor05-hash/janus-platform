# 네이티브 앱 빌드·배포 (EAS)

현재 데모는 **expo-web(브라우저)** 으로 배포됩니다. 이 문서는 iOS/Android **네이티브 앱스토어**
경로를 위한 스캐폴딩과 절차를 정리합니다. 실제 빌드·제출에는 아래 **외부 계정**이 필요합니다.

## 준비된 것 (이 커밋)
- `app.json`: iOS `bundleIdentifier`(com.itall.mentoring)·Android `package`, 알림 설정,
  `expo-notifications` 플러그인, `scheme`, `runtimeVersion`, `extra.eas.projectId` 자리표시자.
- `eas.json`: `development`/`preview`/`production` 빌드 프로파일 + `submit` 설정(자리표시자).
- `expo-notifications`·`expo-device` 의존성 + `src/push.ts` 네이티브 푸시 등록
  (권한 요청 → Expo 푸시 토큰 발급 → `POST /me/push-token`). 웹은 데모 토큰으로 폴백.

## 필요한 외부 계정/자격 (범위 밖 — 가상 스캐폴딩까지만)
- **Expo(EAS) 계정** — `eas login`, `eas init`(실제 `projectId` 발급 → app.json 치환).
- **Apple Developer Program**($99/년) — `appleId`·`appleTeamId`·App Store Connect 앱(`ascAppId`).
- **Google Play Console**($25 1회) — 서비스 계정 키(`google-service-account.json`).
- **푸시 자격증명**: iOS APNs 키(EAS가 관리 가능), Android는 FCM(자동).

## 절차
```bash
cd apps/mobile
npm i -g eas-cli

eas login                      # Expo 계정
eas init                       # projectId 발급 → app.json extra.eas.projectId 자동 설정

# 개발 클라이언트(시뮬레이터/실기기 디버그)
eas build --profile development --platform ios
eas build --profile development --platform android

# 내부 배포(테스터)
eas build --profile preview --platform all

# 프로덕션 빌드 → 스토어 제출
eas build --profile production --platform all
eas submit --profile production --platform ios      # eas.json submit.ios 값 필요
eas submit --profile production --platform android  # 서비스 계정 키 필요
```

## 푸시(서버 연동)
- 서버는 `push_token` 테이블에 기기 토큰을 저장하고, `NotificationProvider`(stub)의 `push`
  채널로 발송합니다(현재 mock 로그). 실 발송은 stub 게이트웨이의 `push` 분기를
  **Expo Push API**(`https://exp.host/--/api/v2/push/send`) 호출로 교체하면 됩니다.
- ENV: 앱은 `EXPO_PUBLIC_API_BASE`(eas.json build 프로파일별)로 API 를 가리킵니다.

## 참고
- `runtimeVersion.policy=sdkVersion` + EAS Update 채널(preview/production)로 OTA 업데이트 가능.
- 앱 아이콘/스플래시 이미지는 미포함(색상만). 스토어 제출 전 `assets/icon.png`(1024²)·
  `adaptive-icon`·스플래시 이미지를 추가하고 app.json 에 경로를 지정해야 합니다.
