import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  // `hot: false` disables the solid-refresh dev-mode HMR wrapper.
  // With it enabled, solid-refresh wraps every component in a proxy
  // that (as of solid-js 1.9.x) does not forward props correctly under
  // @solidjs/testing-library's render(), causing `props` to be
  // undefined inside the component. Tests don't need HMR anyway.
  plugins: [solid({ hot: false })],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    conditions: ["development", "browser"],
  },
});
