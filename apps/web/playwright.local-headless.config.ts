// Local, uncommitted: runs the same projects headless on the full Chromium already installed (no window opens).
import base from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({ ...base, projects: base.projects!.map(p => ({ ...p, use: { ...p.use, channel: "chromium" as const, headless: true } })) });
