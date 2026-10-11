import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// test/identity.integration.test.ts drives the API's identity application layer against real PostgreSQL. That API
// source imports "@jobguard/db" and "@jobguard/config" by package name, which resolve to each package's built `dist`.
// CI runs `pnpm test` before `pnpm build`, and turbo's `^build` only builds this package's own dependencies, so on a
// clean checkout neither `dist` exists. Resolve those two names to their source so the suite does not depend on build
// order; "@jobguard/db" resolves to the same module the tests import as ../src/index.js, so there is one copy of it.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@jobguard\/db$/u, replacement: source("./src/index.ts") },
      { find: /^@jobguard\/config$/u, replacement: source("../config/src/index.ts") },
    ],
  },
});
