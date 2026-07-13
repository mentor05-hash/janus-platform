/* 자동 생성 — branding.config.json + packages/brand/tokens.json 기반. 직접 수정 금지(재생성됨).
 * 재생성: node scripts/apply-branding.mjs  (apps/web/src/branding.generated.ts) */
export const branding = {
  "_comment": "화이트라벨 브랜딩 단일 소스. 값 변경 후 `node scripts/apply-branding.mjs` 실행 → 앱 생성파일·에셋·설정 자동 반영(기능·동작은 불변). 컬러 토큰 전량은 packages/brand/tokens.json 참조.",
  "appName": "야누스",
  "shortName": "야누스",
  "logoMark": "門",
  "tagline": "미래를 여는 문 — 진단·처방·실행의 전환 관문",
  "company": "○○(주)",
  "contactEmail": "privacy@REPLACE",
  "supportEmail": "support@REPLACE",
  "colors": {
    "primary": "#2F6FB3",
    "primaryDark": "#24405F",
    "primary500": "#4D93DA",
    "accent": "#CF9A3A",
    "ink": "#1E3550"
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
export const APP_NAME = "야누스";
export const LOGO_MARK = "門";
export const COLORS = {"primary":"#2F6FB3","primaryDark":"#24405F","primary500":"#4D93DA","accent":"#CF9A3A","ink":"#1E3550"} as const;
/* 야누스 디자인 토큰(라이트/다크) — packages/brand/tokens.json 동기 사본 */
export const TOKENS = {
  "light": {
    "page": "#eef2f8",
    "surface": "#ffffff",
    "surface2": "#f4f7fb",
    "ink": "#1e3550",
    "ink2": "#52627a",
    "ink3": "#8695a8",
    "hair": "#e4eaf1",
    "hair2": "#eef2f7",
    "navy": "#24405f",
    "blue": "#2f6fb3",
    "gold": "#cf9a3a",
    "goldInk": "#a97d24",
    "silver": "#c7ccd2",
    "blueSoft": "rgba(47,111,179,.10)",
    "goldSoft": "rgba(207,154,58,.14)",
    "stable": "#2a8a5f",
    "fit": "#57a86a",
    "reach": "#cf9f2f",
    "high": "#d06b52",
    "stableSoft": "rgba(42,138,95,.11)",
    "fitSoft": "rgba(87,168,106,.13)",
    "reachSoft": "rgba(207,159,47,.14)",
    "highSoft": "rgba(208,107,82,.12)",
    "ai": "#6d5dd3",
    "aiSoft": "rgba(109,93,211,.12)",
    "aug": "#1f8a8a",
    "augSoft": "rgba(31,138,138,.12)",
    "human": "#2f6fb3",
    "humanSoft": "rgba(47,111,179,.10)",
    "chrome": "#0d1626",
    "ghostBg": "#eef2f7",
    "ghostBorder": "#e0e6ee",
    "arrowMuted": "#98a4b5"
  },
  "dark": {
    "page": "#0a1728",
    "surface": "#122036",
    "surface2": "#182a41",
    "ink": "#eaf1f8",
    "ink2": "#93a7bd",
    "ink3": "#657b95",
    "hair": "#23364e",
    "hair2": "rgba(255,255,255,.05)",
    "navy": "#24405f",
    "blue": "#4d93da",
    "gold": "#e3b45c",
    "goldInk": "#e3b45c",
    "silver": "#8496ab",
    "blueSoft": "rgba(77,147,218,.16)",
    "goldSoft": "rgba(227,180,92,.16)",
    "stable": "#33a873",
    "fit": "#66c07a",
    "reach": "#e3ac33",
    "high": "#e26a5b",
    "stableSoft": "rgba(51,168,115,.16)",
    "fitSoft": "rgba(102,192,122,.16)",
    "reachSoft": "rgba(227,172,51,.16)",
    "highSoft": "rgba(226,106,91,.16)",
    "ai": "#9a8be8",
    "aiSoft": "rgba(154,139,232,.18)",
    "aug": "#3fb5b5",
    "augSoft": "rgba(63,181,181,.16)",
    "human": "#4d93da",
    "humanSoft": "rgba(77,147,218,.16)",
    "chrome": "#0d1626",
    "ghostBg": "rgba(255,255,255,.05)",
    "ghostBorder": "#2c4159",
    "arrowMuted": "#657b95"
  },
  "font": {
    "sans": "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    "mono": "'IBM Plex Mono', ui-monospace, monospace"
  }
} as const;
