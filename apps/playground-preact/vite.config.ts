import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "@eaw/preact": path.resolve(
        __dirname,
        "../../packages/preact/src/index.ts"
      ),
      "@eaw/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
});
