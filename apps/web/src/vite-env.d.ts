/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 데모 로그인 편의(자동로그인·역할 원터치·기본 비번) 활성 플래그. 실서비스=미설정. */
  readonly VITE_DEMO_MODE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
