import { defineConfig } from "vitest/config";
export default defineConfig({ resolve: { alias: { "@jobguard/core": new URL("../../core/src/index.ts", import.meta.url).pathname } } });
