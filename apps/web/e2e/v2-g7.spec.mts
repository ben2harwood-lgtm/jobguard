// V2-G7 (Q76): Snags, Handover and the customer's handover pack, finished to the M3 mock, at 360 and 1280 px.
// Every visible control is at least 44 by 44, nothing scrolls sideways, and the customer's pack shows no amount.
// Run on a fresh V2 seed with the launcher up, with JOBGUARD_LOCAL_V2=1 and JOBGUARD_ENV=synthetic_demo (the crew record is
// made in process, as the G1 browser test does): V2_TEST_ORIGIN (web or HTTPS phone origin), V2_TEST_SCREENSHOTS optional.
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";
import { createWorkspaceApplication } from "../../api/dist/workspace/index.js";
import { authenticatePracticeSession, withTenant } from "../../../packages/db/dist/index.js";

test.skip(!process.env.V2_TEST_ORIGIN, "Requires the running V2 launcher.");
test.describe.configure({ mode: "serial" });

const tenantId = "11111111-1111-4111-8111-111111111111";
const widths = [360, 1280] as const;
let ownerState: Awaited<ReturnType<BrowserContext["storageState"]>>;
let jobId: string;
let crewName: string;

async function shot(page: Page, name: string, width: number) {
  if (!process.env.V2_TEST_SCREENSHOTS) return;
  await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `g7-${name}-${width}.png`), fullPage: true });
}

/** Every visible button, select, input and checkbox inside the screen is at least 44 by 44, and nothing scrolls sideways. */
async function phoneReady(page: Page, screen: Locator, where: string) {
  const small = await screen.evaluate(root => [...root.querySelectorAll("button, select, input, textarea, a.btn")].flatMap(element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (!box.width || !box.height || style.visibility === "hidden" || (element as HTMLInputElement).type === "hidden") return [];
    return box.width < 44 || box.height < 44 ? [`${element.tagName.toLowerCase()} "${(element.textContent || (element as HTMLInputElement).type).trim().slice(0, 40)}" ${Math.round(box.width)}x${Math.round(box.height)}`] : [];
  }));
  expect(small, `${where}: controls under 44 px`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${where}: no sideways scroll`).toBe(true);
}

/** API calls from inside the signed-in page, so the browser's own session cookie goes with them on any origin. */
async function api<T>(page: Page, path: string, data?: unknown): Promise<T> {
  return page.evaluate(async ([url, body]) => {
    const response = await fetch(url, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${url} ${response.status} ${await response.text()}`);
    return response.json();
  }, [path, data] as const) as Promise<T>;
}

async function context(browser: Browser, width: number, signedIn = true) {
  return browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true, ...(signedIn ? { storageState: ownerState } : {}) });
}

test.beforeAll(async ({ browser }) => {
  const origin = process.env.V2_TEST_ORIGIN!;
  const owner = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: origin });
  try {
    const page = await owner.newPage();
    await page.goto("/sign-in");
    await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
    await page.getByLabel("What do you want to do?").selectOption("signin");
    await page.getByRole("button", { name: "Request code", exact: true }).click();
    const code = page.getByTestId("fixture-code");
    await expect(code).toHaveText(/^[0-9]{8}$/u);
    await page.getByLabel("Eight-digit code").fill(await code.innerText());
    await page.getByRole("button", { name: "Verify code", exact: true }).click();
    await expect(page).toHaveURL(/\/practice-company$/u);
    ownerState = await owner.storageState();
    jobId = (await api<{ jobs: { id: string }[] }>(page, `/api/jobs?tenantId=${tenantId}`)).jobs[0]!.id;
    await api(page, `/api/jobs/${jobId}/quotes/activation`, { version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" }).catch(() => undefined);
    // One crew member, so a second person can check the snag. Recorded as the G1 browser test does.
    // The launcher's own settings reader (an untyped .mjs, so loaded by path).
    const settingsModule = "../../../tools/v2/settings.mjs";
    const { validateSettings } = await import(settingsModule);
    const pool = new Pool({ connectionString: validateSettings({}).settings.DATABASE_URL, max: 1 });
    try {
      crewName = `Jordan Featherstonehaugh-Cholmondeley ${randomUUID().slice(0, 4)}`;
      const sessionId = ownerState.cookies.find(cookie => cookie.name === "jg_session")!.value;
      await createWorkspaceApplication({ pool, sessionId })
        .crewContacts.record({ version: "crew-contact.v1", commandId: randomUUID(), crewId: randomUUID(), expectedRevision: 0,
          displayName: crewName, trade: "joiner", phone: "07700 900611", email: null });
      // No V2 command completes site work yet; release needs it. Main's transition, as this practice session (as the G3 seed does).
      const { context } = await authenticatePracticeSession(pool, sessionId);
      await withTenant(pool, context, async db => {
        const { rows } = await db.$client.query<{ id: string; stage: string; revision: number }>(`SELECT scope_item_id AS id, stage, revision
          FROM app.scope_progress WHERE job_id=$1 AND stage<>'complete'`, [jobId]);
        for (const { id, stage, revision } of rows) {
          if (stage === "not_started") await db.$client.query("SELECT app.transition_scope_progress($1,$2,$3,$4,'in_progress','start')",
            [tenantId, jobId, id, revision]);
          await db.$client.query("SELECT app.transition_scope_progress($1,$2,$3,$4,'complete','complete')",
            [tenantId, jobId, id, revision + (stage === "not_started" ? 1 : 0)]);
        }
      });
    } finally { await pool.end(); }
  } finally { await owner.close(); }
});

test("Snags: the M3 empty state, then one snag fixed and checked, at 360 and 1280", async ({ browser }) => {
  const origin = process.env.V2_TEST_ORIGIN!;
  for (const [index, width] of widths.entries()) {
    const owner = await context(browser, width);
    try {
      const page = await owner.newPage();
      await page.goto(`${origin}/jobs/${jobId}/records`);
      await page.getByRole("link", { name: "Snags", exact: true }).click();
      const screen = page.getByTestId("snag-register");
      if (index === 0) {
        await expect(screen).toContainText("No snags recorded yet");
        await expect(screen).toContainText("Add a snag with an owner, due date and photo when you find one.");
        await phoneReady(page, screen, `snags empty ${width}`);
        await shot(page, "snags-empty", width);
        const form = screen.getByRole("article", { name: "Record another snag" });
        // A long title with no spaces, and a long typed name: both wrap rather than push the page sideways.
        const title = "Refit-the-hall-door-stop-and-the-understairs-cupboard-catch-before-handover";
        await form.getByLabel("What needs doing").fill(title);
        await form.getByLabel("Owner").selectOption({ label: `${crewName} · joiner` });
        await form.getByLabel("Due").fill("2026-12-04");
        await form.getByRole("button", { name: "Add a snag" }).click();
        const card = screen.getByRole("article", { name: title });
        await card.getByLabel("Who fixed it").selectOption({ label: crewName });
        await card.getByRole("button", { name: "Mark fixed" }).click();
        await expect(card).toContainText(`Fixed: ${crewName}`);
        await card.getByLabel("Checked by a second person").selectOption({ label: "The builder · second person" });
        await card.getByRole("button", { name: "Mark checked" }).click();
        await expect(card).toContainText("Checked: The builder · second person");
        const typed = screen.getByRole("article", { name: "Record another snag" });
        await typed.getByLabel("Owner").selectOption({ label: "Someone else (type a name)" });
        await typed.getByLabel("Their name").fill("Maximilian-Bartholomew-Featherstonehaugh-Worthington (plasterer)");
        await page.reload();
      }
      await expect(screen.getByText(/Checked: .* · second person/u)).toBeVisible();
      await phoneReady(page, screen, `snags checked ${width}`);
      await shot(page, "snags-checked", width);
    } finally { await owner.close(); }
  }
});

test("Handover: no draft, then a saved version, then the customer's pack current and older, at 360 and 1280", async ({ browser }) => {
  const origin = process.env.V2_TEST_ORIGIN!;
  {
    for (const [index, width] of widths.entries()) {
      const owner = await context(browser, width), customer = await context(browser, width, false);
      try {
        const page = await owner.newPage();
        await page.goto(`${origin}/jobs/${jobId}/handover`);
        const screen = page.getByTestId("handover");
        if (index === 0) {
          await expect(screen).toBeVisible();
          await phoneReady(page, screen, `handover no draft ${width}`);
          await shot(page, "handover-empty", width);
          await screen.getByRole("button", { name: "Preview as the customer sees it" }).click();
          await screen.getByRole("button", { name: "Save this version" }).click();
        }
        const releases = page.getByTestId("handover-releases");
        await releases.getByRole("button", { name: /^Release this version · version \d+$/u }).first().click();
        const link = await releases.getByTestId("handover-link").last().getAttribute("href");
        await phoneReady(page, screen, `handover saved ${width}`);
        await shot(page, "handover-saved", width);

        const pack = await customer.newPage();
        await pack.goto(link!);
        const view = pack.getByTestId("handover-pack-page");
        await expect(view).toContainText("Receipt only");
        await expect(view.getByTestId("handover-newer")).toHaveCount(0);
        await phoneReady(pack, view, `pack current ${width}`);
        expect(await view.innerText()).not.toMatch(/£|pence/iu);
        await shot(pack, "pack-current", width);

        // A newer version released: the older link puts the alert first, and still shows its own version only.
        await screen.getByRole("button", { name: "Preview as the customer sees it" }).click();
        await screen.getByRole("button", { name: "Save this version" }).click();
        await page.reload();
        await page.getByTestId("handover-releases").getByRole("button", { name: /^Release this version · version \d+$/u }).first().click();
        // The new link shows once the release is saved (the history line below can already say "newer" from an earlier round).
        await expect(page.getByTestId("handover-releases").getByTestId("handover-link")).toBeVisible();
        await expect(page.getByTestId("handover-releases")).toContainText("a newer version was released");
        await pack.reload();
        const alert = view.getByRole("alert");
        await expect(alert).toContainText("Newer version available");
        // First in the pack content itself (CustomerPack's form), after the page header: nothing comes before it.
        expect(await view.getByTestId("handover-newer").evaluate(node => node.getAttribute("role") === "alert" && !node.previousElementSibling)).toBe(true);
        await phoneReady(pack, view, `pack older ${width}`);
        expect(await view.innerText()).not.toMatch(/£|pence/iu);
        await shot(pack, "pack-older", width);
      } finally { await customer.close(); await owner.close(); }
    }
  }
});
