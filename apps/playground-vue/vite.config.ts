import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@eaw/vue": path.resolve(__dirname, "../../packages/vue/src/index.ts"),
      "@eaw/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
});
