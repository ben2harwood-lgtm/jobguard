import { defineConfig } from "@playwright/test";
import fridayUpdateConfig from "./playwright.v2-k3.config";

// Reuse K3's HTTPS phone origin, browser, single worker and external stack.
export default defineConfig({ ...fridayUpdateConfig, testMatch: "friday-share.browser.ts",
  projects: [{ name: "v2-k1" }],
});
