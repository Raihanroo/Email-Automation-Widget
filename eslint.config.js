// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

/**
 * Root ESLint flat config for the Email Automation Widget monorepo.
 *
 * প্রতিটা package (core, react, apps/*) এই root config extend করে
 * নিজস্ব ছোট eslint.config.js রাখতে পারে — কিন্তু বেশিরভাগ ক্ষেত্রে
 * এই একটাই config পুরো workspace-এ কাজ চালিয়ে দেয়ার জন্য যথেষ্ট।
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/.svelte-kit/**",
      "**/coverage/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Monorepo bootstrap পর্যায়ে খুব কড়া না রেখে, প্রোডাক্টিভিটি
      // বাধাগ্রস্ত না করে ধীরে ধীরে কড়াকড়ি বাড়ানো হবে পরের milestone-এ।
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Prettier-এর সাথে সংঘর্ষে যায় এমন formatting rule বন্ধ — সবসময় শেষে থাকতে হবে।
  eslintConfigPrettier
);
