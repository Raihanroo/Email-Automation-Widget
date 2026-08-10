/// <reference types="vitest" />
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import angular from "@analogjs/vite-plugin-angular";

const tsconfigSpec = fileURLToPath(
  new URL("./tsconfig.spec.json", import.meta.url)
);

export default defineConfig({
  plugins: [angular({ tsconfig: tsconfigSpec })],
  test: {
    globals: true,
    setupFiles: ["src/vitest.setup.ts"],
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
  define: {
    "import.meta.vitest": (mode) => mode,
  },
});
