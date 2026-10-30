import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// CI-only real existing routes. This is refusal coverage, not EP-C08 or the
// dependency-held shadow-30000 positive journey. No fabricated success response.
test("CH8-V unauthenticated v3 requests reveal neither dependency nor subject state", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("CI application baseURL is required");
  const context = await browser.newContext({ baseURL });
  try {
    for (const id of [randomUUID(), "AB000000-0000-4000-8000-000000000001"]) {
      const path = `/api/recovery-cases/${id}/evidence-packs`;
      for (const [url, data] of [
        [path, { version: "evidence-pack-command.v3", commandId: randomUUID(), format: "TEXT", expectedVisibleSourceRevision: "a".repeat(64) }],
        [`${path}/${randomUUID()}/attachment-approval`, { version: "evidence-pack-attachment-approval.v3", commandId: randomUUID(), expectedManifestHash: "a".repeat(64), expectedContentHash: "a".repeat(64) }],
      ] as const) {
        const response = await context.request.post(url, { data });
        expect(response.status()).toBe(401);
        expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
        expect(response.headers()["cache-control"]).toBe("no-store");
      }
    }
  } finally { await context.close(); }
});

// Fresh synthetic source fixture, followed by actual quote/live/lock/catch/invoice,
// receipt, neutral-allocation and attribution writers. No ready-made pack is seeded.
// The classifier proposal is a controlled fixture input, not a live AI evaluation.
test("shadow-30000: build and approve a settled catch pack; UI, download and offline verifier agree", async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  const { withSyntheticShadow } = await import("./helpers/final-account-lock-journey.js");
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const { join } = await import("node:path");
  const requireApi = createRequire(join(__dirname, "../../api/package.json"));
  const { verifyStandalonePackV3 } = await import("@jobguard/core");
  const { spawnSync } = await import("node:child_process");
  const { writeFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  process.env.JOBGUARD_ENV = "synthetic_demo";
  await withSyntheticShadow("11111111-1111-4111-8111-111111111111", async (shadow, admin) => {
    // Keep the fixture's ESM graph out of Playwright's mixed module loader/cache.
    // Use the existing TS loader in a fresh Node process, with the same restricted
    // shadow login and real writers. Credentials travel over stdin, never argv.
    const fixturePath = pathToFileURL(require.resolve("../../../packages/db/test/evidence-pack-v3-catch-fixture.ts")).href;
    const setup = spawnSync(process.execPath, ["--import", pathToFileURL(requireApi.resolve("tsx")).href, "--input-type=module", "--eval", `
      import { readFileSync } from 'node:fs';
      import { Pool } from 'pg';
      const { shadowPackCatch } = await import(${JSON.stringify(fixturePath)});
      const config = JSON.parse(readFileSync(0, 'utf8'));
      const admin = new Pool(config.admin), shadow = new Pool(config.shadow);
      const runtime = new Pool({ connectionString: config.runtime, max: 1 });
      try {
        const x = await shadowPackCatch({ admin, runtime, shadow });
        process.stdout.write(JSON.stringify({ session: x.session, jobId: x.jobId,
          paymentId: x.paymentId, attribution: x.attribution }));
      } finally { await Promise.all([admin.end(), runtime.end(), shadow.end()]); }
    `], { encoding: "utf8", timeout: 180_000, input: JSON.stringify({
      // pg-pool intentionally makes password non-enumerable on its options.
      admin: { ...admin.options, password: admin.options.password },
      shadow: { ...shadow.options, password: shadow.options.password },
      runtime: "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo",
    }), env: { ...process.env, JOBGUARD_ENV: "synthetic_demo" } });
    expect(setup.error, "Synthetic fixture subprocess must complete").toBeUndefined();
    expect(setup.status, setup.stderr).toBe(0);
    const x = JSON.parse(setup.stdout);
    expect(x.attribution.assessmentOutcome).toBe("eligible_for_review");
    await context.addCookies([{ name: "jg_session", value: x.session, url: baseURL! }]);
    await page.goto(`/jobs/${x.jobId}`);
    await expect(page.getByRole("heading", { name: "Chase unpaid money", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^missed variation final account ·/ }).click();
    await page.getByRole("button", { name: "Open lock and reveal packs", exact: true }).click();
    const build = page.getByRole("button", { name: "Build lock and reveal pack", exact: true });
    await expect(build).toBeEnabled(); await build.click();
    const explorer = page.getByTestId("pack-v3-explorer");
    await expect(explorer).toBeVisible({ timeout: 180_000 });
    await expect(explorer).toContainText("Content matches manifest");
    const url = await explorer.getByRole("link", { name: "Download lock and reveal pack" }).getAttribute("href");
    const response = await page.request.get(url!);
    expect(response.ok()).toBe(true);
    const text = await response.text(), report = verifyStandalonePackV3(text);
    await expect(explorer.getByTestId("pack-v3-manifest-hash")).toHaveText(report.manifestHash);
    const artifact = JSON.parse(text);
    expect(artifact.manifest.sections.every((s: { status: string }) => s.status === "present")).toBe(true);
    expect(artifact.sources.some((s: { sourceId: string }) => s.sourceId === `customer_payment:${x.paymentId}`)).toBe(true);
    expect(artifact.sources.some((s: { sourceId: string }) => s.sourceId === `recovery_attribution_revision:${x.attribution.assessmentId}`)).toBe(true);
    const path = testInfo.outputPath("shadow-30000-pack.txt"); await writeFile(path, text);
    const cli = resolve(process.cwd(), "../../packages/db/tools/verify-evidence-pack.mjs");
    const verified = spawnSync(process.execPath, [cli, path], { encoding: "utf8" });
    expect(JSON.parse(verified.stdout)).toMatchObject(report);
    expect(verified.status).toBe(1); // No independent checkpoint supplied by this journey.
    await explorer.getByRole("button", { name: "Approve lock and reveal pack for attachment" }).click();
    await expect(explorer).toContainText("Approval recorded for these exact hashes", { timeout: 180_000 });
    await page.reload();
    await page.getByRole("button", { name: "Open lock and reveal packs", exact: true }).click();
    await expect(page.getByTestId("pack-v3-manifest-hash")).toHaveText(report.manifestHash);
    await expect(page.getByTestId("pack-v3-explorer")).toContainText("Approval recorded for these exact hashes");
  });
});
