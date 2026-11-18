import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { setupFiles: ["../web/test/setup-worker-role.ts"] },
});
