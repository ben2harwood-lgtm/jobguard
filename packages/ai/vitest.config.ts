import { defineConfig } from "vitest/config";
// Run every source test once, independent of whether `build` ran first.
// Emitted dist/*.test.js duplicates are artifacts, not additional coverage.
export default defineConfig({ test: { include: ["src/**/*.{test,spec}.{ts,tsx}"] } });
