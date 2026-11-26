import type { Browser, BrowserContext } from "../../../apps/web/node_modules/@playwright/test/index.js";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
export function v2Origin(): string;
export function launchV2Browser(): Promise<Browser>;
export function signInOnce(browser: Browser, options?: { jobTitle?: string }): Promise<{
  origin: string; storageState: StorageState; csrfToken: string; jobId: string;
}>;
export function v2Context(browser: Browser, storageState: StorageState, width: number): Promise<BrowserContext>;
