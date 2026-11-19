import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const titles = [
  "ENT-11b full Northside through billing, statement and dashboard at 1280px under ten minutes",
  "DEMO-J1 fresh selection launch, five-line job, completed worker check, receipts, reversal, correction, source links and saved report",
  "DEMO-J2 recovery-18800 reaches all five figures through the complete fresh journey",
  "DEMO-J3 fresh shadow-30000 completes customer approvals, one paid invoice, £800 Q and verified packs",
];
const escapeRegex = (value: string) => value.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
const evidence = resolve(__dirname, "test-results/tommy-recordings-meta");

export default defineConfig({
  ...base,
  testMatch: [
    "**/ENT-11b.spec.ts",
    "**/DEMO-J1-core-1000.spec.ts",
    "**/DEMO-J2.spec.ts",
    "**/DEMO-J3-shadow.spec.ts",
  ],
  grep: new RegExp("(?:" + titles.map(escapeRegex).join("|") + ")$"),
  workers: 1,
  retries: 0,
  outputDir: resolve(__dirname, "test-results/tommy-recordings"),
  reporter: [
    ["./diagnostics/tommy-recordings-reporter.ts"],
    ["list"],
    ["json", { outputFile: resolve(evidence, "test-report.json") }],
    ["html", { open: "never", outputFolder: resolve(__dirname, "playwright-report/tommy-recordings") }],
  ],
  use: {
    ...base.use,
    video: { mode: "on", size: { width: 1280, height: 800 } },
    trace: "on",
    // Playwright 1.55.1's page fixture supplies its own per-test video directory.
    // Its browser.newContext() API inherits this fallback for separate customer
    // and isolation contexts, which the existing specs explicitly close.
    contextOptions: {
      ...base.use?.contextOptions,
      recordVideo: {
        dir: resolve(__dirname, "test-results/tommy-recordings/manual-contexts"),
        size: { width: 1280, height: 800 },
      },
    },
  },
  projects: base.projects!.filter(project => project.name === "desktop"),
});
