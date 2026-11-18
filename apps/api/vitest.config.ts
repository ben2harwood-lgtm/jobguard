import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: [fileURLToPath(new URL("../web/test/setup-worker-role.ts", import.meta.url))],
  },
});
