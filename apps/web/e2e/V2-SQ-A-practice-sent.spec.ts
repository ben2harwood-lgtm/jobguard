import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// V2-SQ-A: a practice send is visible afterwards. Send a practice quote, follow "See it in Sent", see the row,
// open the exact document; a second firm sees none of it.
type Preview = { view: { documentId: string; reference: string; documentVersion: number; contentHash: string } };
const click = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

async function sendPracticeQuote(page: Page, firm: "own" | "shared example" = "own"): Promise<{ jobId: string; preview: Preview }> {
  if (firm === "own") {
    await page.goto("/practice-company");
    await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  } else {
    // The shared example tenant: every "Look around an example firm" session shares it, so ownership must filter.
    expect((await page.request.post("/api/session")).ok()).toBe(true);
    await page.goto("/classic");
  }
  await click(page, "＋ Start a new job");
  await page.getByLabel("Work details").fill("JOB: Fictional Sent list job\nITEM: Protect room | £200.00\nITEM: Paint walls | £300.00");
  await click(page, "Make my draft"); await click(page, "Check and edit my draft");
  await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  const jobId = new URL(page.url()).pathname.split("/").at(-1)!;
  await click(page, "Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  for (const name of ["Protect room", "Paint walls"]) await click(page, `Accept ${name}`);
  const disposal = page.getByLabel(/Answer Confirm disposal/u);
  if (await disposal.count()) await disposal.fill("Builder removes fictional waste");
  await click(page, "Confirm scope"); await click(page, "Price the work");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  await click(page, "Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  const response = page.waitForResponse(r => r.url().endsWith("/quotes/preview") && r.request().method() === "POST");
  await click(page, "Preview this quote");
  const result = await response; expect(result.ok(), await result.text()).toBe(true);
  const preview = await result.json() as Preview;
  await click(page, "Simulate sending this quote");
  if (firm === "shared example") {
    // The shared example firm is not a blank practice company, so its send waits in the queue for the fake worker
    // (QuoteApplication.issue runs the fake delivery only for a blank practice company). Advance it as a builder would.
    await expect(page.locator(".quote-notice")).toHaveText("The exact quote is queued only for the deterministic fake worker. Nothing was sent.");
    await click(page, "Continue fake worker");
  }
  await expect(page.locator(".quote-notice")).toHaveText("Simulated delivery — nothing real was sent.");
  return { jobId, preview };
}

test("a practice quote send shows in Sent and opens the exact document", async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const { jobId, preview } = await sendPracticeQuote(page);
  await page.getByRole("link", { name: "See it in Sent", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Your messages" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("tab", { name: "Sent" })).toHaveAttribute("aria-selected", "true");
  const row = panel.locator(`[data-sent-document="${preview.view.documentId}"]`);
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-focused", "true");
  await expect(row).toContainText(`Quote ${preview.view.reference}, version ${preview.view.documentVersion}`);
  await expect(row).toContainText("Practice, not really sent");
  await expect(row).toContainText("To practice-customer@example.invalid");
  await expect(row).toContainText("Shown as sent");
  await expect(row.getByRole("link", { name: "Fictional Sent list job" })).toHaveAttribute("href", `/jobs/${jobId}/overview`);
  const open = row.getByRole("link", { name: "Open the exact quote" });
  await expect(open).toHaveAttribute("data-content-hash", preview.view.contentHash);
  const document = await page.request.get((await open.getAttribute("href"))!);
  expect(document.ok()).toBe(true);
  expect(createHash("sha256").update(await document.body()).digest("hex")).toBe(preview.view.contentHash);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath(`sent-${info.project.name}.png`) });
  await info.attach(`sent-${info.project.name}`, { path: info.outputPath(`sent-${info.project.name}.png`), contentType: "image/png" });

  // Rule 29: a second firm sees none of the first firm's rows, over HTTP and on screen.
  const separate = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize()! });
  try {
    const other = await separate.newPage(); await other.goto("/practice-company");
    await expect(other.getByRole("heading", { name: "Ready for your first job", exact: true })).toBeVisible();
    const list = await other.request.get("/api/practice-sent");
    expect(list.status()).toBe(200);
    expect(list.headers()["cache-control"]).toBe("no-store");
    expect(await list.json()).toEqual({ items: [] });
    expect((await other.request.get(`/api/jobs/${jobId}/quotes/artifacts/${preview.view.documentId}`)).ok()).toBe(false);
    await other.goto("/today?panel=sent");
    const empty = other.getByRole("dialog", { name: "Your messages" });
    await expect(empty.getByRole("heading", { name: "Nothing sent yet." })).toBeVisible();
    await noOverflow(other);
  } finally { await separate.close(); }
});

test("in the shared example firm, one session never sees another session's sends", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const { jobId, preview } = await sendPracticeQuote(page, "shared example");
  const mine = await (await page.request.get("/api/practice-sent")).json() as { items: { documentId: string }[] };
  expect(mine.items.map(item => item.documentId)).toContain(preview.view.documentId);
  const separate = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize()! });
  try {
    const other = await separate.newPage();
    expect((await other.request.post("/api/session")).ok()).toBe(true);
    const theirs = await (await other.request.get("/api/practice-sent")).json() as { items: { documentId: string }[] };
    expect(theirs.items.map(item => item.documentId)).not.toContain(preview.view.documentId);
    // Plan-check condition 1: in the same tenant, the link to the exact document is refused for another session.
    expect((await other.request.get(`/api/jobs/${jobId}/quotes/artifacts/${preview.view.documentId}`)).ok()).toBe(false);
  } finally { await separate.close(); }
});

test("the Sent list refuses a request with no practice session", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL: baseURL! });
  try { expect((await anonymous.get("/api/practice-sent")).status()).toBe(401); } finally { await anonymous.dispose(); }
});
