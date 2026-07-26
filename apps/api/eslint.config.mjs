// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // `_` 접두 인자는 인터페이스 형태를 문서화하려고 남긴 것 — 삭제하면 시그니처 의도가 사라진다.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error', // 미처리 프라미스는 조용한 실패를 만든다 — 전량 해소됨(2026-07-26)

      // ── 정리 대기 부채(래칫) ────────────────────────────────────────
      // 2026-07-26 실측 1509건 → 133건. 남은 계열은 값 타이핑 작업이 필요해 한 번에 못 고친다.
      // 'warn' 으로 두고 CI 는 `--max-warnings` 로 **현재 수치를 상한**으로 고정한다 →
      // 새 위반은 CI 를 실패시키고, 부채는 줄어드는 방향으로만 움직인다.
      // 우선 정리 순서: no-base-to-string(실버그 위험: 문자열에 "[object Object]") →
      //   unsafe-* 계열(Prisma JSON·외부 응답 타이핑) → require-await.
      // ⚠ 끄는 이유: 이 룰의 autofix 가 Prisma JSON 입력용 `as unknown as object` 이중 캐스트를
      // "불필요"로 보고 제거하는데, tsc 는 그 캐스트를 요구한다 → 빌드가 깨진다(2026-07-26 실측:
      // availability.service·pg-webhook.service). `--fix` 는 경고도 수정하므로 'warn' 으로는 못 막는다.
      // Prisma JSON 타입을 정리(전용 헬퍼 도입)한 뒤 다시 켠다.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
