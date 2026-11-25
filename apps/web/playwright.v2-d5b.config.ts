import { defineConfig } from "@playwright/test";
import config from "./playwright.v2-d5a.config";
export default defineConfig({ ...config, testMatch: "v2-d5b.spec.mts" });
