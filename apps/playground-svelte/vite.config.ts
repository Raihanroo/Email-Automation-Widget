import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@eaw/svelte": path.resolve(
        __dirname,
        "../../packages/svelte/src/index.ts"
      ),
      "@eaw/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
});
