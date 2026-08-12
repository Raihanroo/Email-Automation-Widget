import { defineConfig } from "vitest/config";

// Unlike the framework wrapper packages (react/vue/svelte/…), core is
// pure framework-agnostic TS logic with no DOM interaction, so it runs
// under the plain "node" environment — no jsdom, no setupFiles needed.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
});
