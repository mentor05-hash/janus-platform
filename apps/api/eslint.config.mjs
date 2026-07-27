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
      // ⚠ 끈 이유: 이 규칙의 **자동수정이 이 저장소의 빌드를 깨뜨린다**(실측).
      //
      // 예) `schedule: (dto.schedule ?? []) as object` 를 "receiver 가 원래 타입을 받으므로
      //     불필요"라고 판정하는데, 제거하면 tsc 가 거부한다:
      //       Type 'ScheduleSlotDto[]' is not assignable to type 'JsonNull | InputJsonValue'
      //       (InputJsonObject 에 index signature 가 필요)
      //     eslint 의 타입 판정과 tsc 가 갈리는 지점이고, 단언 쪽이 맞다.
      //
      // `npm run lint` 는 `--fix` 를 포함하므로 severity 를 warn 으로만 낮추면 소용없다 —
      // eslint 는 경고도 고친다. 실측: 실행 한 번에 단언 73개 제거 → **tsc 오류 47건**.
      // 그래서 off 로 둔다. Prisma JSON 입력 타입을 제대로 정리한 뒤 되살릴 것.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
