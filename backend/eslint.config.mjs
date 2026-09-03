// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "generated/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  // Test files: relax rules that fight normal test patterns — supertest's
  // `res.body` is untyped (`any`) by design, which would otherwise cascade
  // `no-unsafe-*` errors through every assertion on a JSON response body.
  // `unbound-method` is disabled here too: repositories built on
  // `BaseRepository` expose their generic CRUD as class-instance methods
  // (unlike utilisateurs.repository.ts's standalone function exports), and
  // `vi.mocked(personneRepository.findById)` triggers this rule even though
  // vitest's mock never calls the method with a detached `this` — a known
  // false positive with this exact vi.mocked-on-class-instance pattern.
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  // Root-level tooling config files aren't part of the app's tsconfig project
  // (src/tests only) — lint them without type-aware rules.
  {
    files: ["*.config.{js,mjs,ts,mts}", "prisma.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        module: "writable",
        require: "readonly",
        process: "readonly",
        __dirname: "readonly",
      },
    },
  },
  eslintConfigPrettier,
);
