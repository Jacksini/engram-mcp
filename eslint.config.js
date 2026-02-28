// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  // Base recommended rules
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // Disable ESLint formatting rules that conflict with Prettier
  prettierConfig,
  {
    // Apply to all TS/JS source and test files
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      // Allow unused vars prefixed with underscore
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Allow explicit `any` in tests; error in src
      "@typescript-eslint/no-explicit-any": "warn",
      // Prefer const assertions
      "prefer-const": "error",
    },
  },
  {
    // Slightly relaxed rules for test files
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Ignore compiled output and node_modules
    ignores: ["build/**", "node_modules/**"],
  }
);
