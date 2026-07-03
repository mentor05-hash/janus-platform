/* 자동 생성 — branding.config.json 기반. 직접 수정 금지(재생성됨).
 * 재생성: node scripts/apply-branding.mjs  (apps/web/src/branding.generated.ts) */
export const branding = {
  "_comment": "화이트라벨 브랜딩 단일 소스. 값 변경 후 `node scripts/apply-branding.mjs` 실행 → 앱 생성파일·에셋·설정 자동 반영(기능·동작은 불변).",
  "appName": "멘토링 플랫폼",
  "shortName": "멘토링",
  "logoMark": "멘",
  "tagline": "학습센터 선생님과 1:1 상담·멘토링",
  "company": "○○(주)",
  "contactEmail": "privacy@REPLACE",
  "supportEmail": "support@REPLACE",
  "colors": {
    "primary": "#0E5C7C",
    "primaryDark": "#0A4A64",
    "primary500": "#1A7FA8",
    "accent": "#F3B34D",
    "ink": "#16242B"
  },
  "ids": {
    "bundleId": "com.example.mentoring",
    "scheme": "mentoring",
    "slug": "mentoring-platform"
  },
  "urls": {
    "apiBase": "http://localhost:3000/api/v1",
    "webOrigin": "",
    "privacyUrl": "https://REPLACE/privacy",
    "termsUrl": "https://REPLACE/terms"
  }
} as const;
export const APP_NAME = "멘토링 플랫폼";
export const LOGO_MARK = "멘";
export const COLORS = {"primary":"#0E5C7C","primaryDark":"#0A4A64","primary500":"#1A7FA8","accent":"#F3B34D","ink":"#16242B"} as const;
