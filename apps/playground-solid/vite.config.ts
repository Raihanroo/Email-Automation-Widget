import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "@eaw/solid": path.resolve(
        __dirname,
        "../../packages/solid/src/index.ts"
      ),
      "@eaw/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
});
