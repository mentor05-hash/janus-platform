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
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // `_` 접두사는 이 저장소가 이미 쓰고 있던 "안 쓰지만 지울 수 없다"는 표시다 —
      // 인터페이스 구현체(mock provider 등)는 시그니처를 맞추려 인자를 받아야 하고,
      // 지우면 계약이 깨진다. 규칙이 그 의도를 모르니 알려 준다. 지울 수 있는 것(미사용
      // import·변수)은 실제로 지웠지, 접두사로 덮지 않았다.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true, // `const { file: _f, ...meta } = x` — 뽑아 버리려는 목적
        },
      ],
      // 2026-07-29 되살림. 껐던 이유는 이 규칙의 **자동수정이 빌드를 깨뜨렸기** 때문이다
      // (`npm run lint` 는 `--fix` 를 포함하므로 warn 으로 낮춰도 소용없었다 — eslint 는
      //  경고도 고친다. 실측: 한 번에 단언 73개 제거 → tsc 오류 47건).
      //
      // 근본 원인은 규칙이 **두 자리에서 오판**한다는 것이었다. 둘 다 "이미 대입 가능하니
      // 단언이 불필요하다"고 보지만, 지우면 안전성이 사라진다:
      //   ① Prisma JSON 입력 — `x as object` 를 지우면 tsc 가 거부한다
      //      (`InputJsonValue` 는 index signature 를 요구하는데 이름 붙은 타입엔 없다).
      //      → `common/prisma/json.ts` 의 `toJson()` 으로 단언을 한 곳에 모았다. 호출부에
      //        단언이 없으니 규칙이 볼 것도 없고, 이유는 헬퍼 주석에 남는다.
      //   ② `any` 에 건 단언 — `any` 는 무엇에든 대입 가능하므로 규칙이 불필요로 본다.
      //      지우면 `any` 가 그대로 흘러 no-unsafe-* 가 줄줄이 뜬다(실측: gateway 1곳에서 9건).
      //      → 단언 대신 **제네릭으로 받는다**(`jwt.verify<T>(token)`). 단언이 아니므로
      //        규칙 대상이 아니고 타입도 진짜로 붙는다.
      //
      // 남은 73건은 실제로 불필요해 제거했다. 새 코드가 무의미한 단언을 들이면 이제 막힌다.
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
