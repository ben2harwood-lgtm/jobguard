import { expect, test, type BrowserContext } from "@playwright/test";
import { openQuote } from "./helpers/capture-journey";

const tenantId = "11111111-1111-4111-8111-111111111111";
type Summary = { id: string; title: string; document: { kind: string; reference: string | null; delivery: string } };
async function summaries(context: BrowserContext): Promise<Summary[]> {
  const response = await context.request.get(`/api/jobs?tenantId=${tenantId}`);
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).jobs;
}

test("L143-1 title alone cannot create Q1007 or delivered status on home reload", async ({ page }) => {
  expect((await page.request.post("/api/session")).ok()).toBe(true);
  const jobs = await summaries(page.context());
  for (const title of ["Kitchen extension", "Loft conversion"]) {
    expect(jobs.find(job => job.title === title)!.document).toEqual({ kind: "none", reference: null, delivery: "not_sent" });
  }
  await page.goto("/"); await page.reload();
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Kitchen extension", exact: true }) });
  await expect(card).toContainText("None yet");
  await expect(card).not.toContainText("Q-1007");
});

test("L143-2 L143-3 L143-4 L143-6 persisted document and delivery survive reload and second authorised context; another practice session cannot see them", async ({ page, browser }) => {
  await openQuote(page);
  for (const input of await page.getByLabel(/Unit rate/u).all()) if (await input.inputValue() === "") await input.fill("100.00");
  await page.getByRole("button", { name: "Save draft revision", exact: true }).click();
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await page.getByRole("button", { name: "Preview immutable quote", exact: true }).click();
  await expect(page.getByLabel("Quote preview")).toContainText("Document version 1");
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  const deliveryResponse = await page.request.get(`/api/jobs/${jobId}/quotes/delivery`);
  expect(deliveryResponse.ok(), await deliveryResponse.text()).toBe(true);
  const persisted = await deliveryResponse.json();
  const find = async (context: BrowserContext) => (await summaries(context)).find(job => job.id === jobId)!;
  const preview = await find(page.context());
  expect(preview.document).toMatchObject({ kind: "quote", delivery: "not_sent" });
  expect(preview.document.reference).toBeTruthy();
  expect(persisted.documentId).toBeTruthy();
  const second = await browser.newContext({ baseURL: "http://127.0.0.1:3000", storageState: await page.context().storageState() });
  const stranger = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    await page.getByRole("button", { name: "Simulate sending this quote", exact: true }).click();
    await expect(page.getByTestId("quote-delivery")).toHaveText("Queued — not sent");
    expect((await find(second)).document).toMatchObject({ delivery: "queued" });
    await page.getByRole("button", { name: "Continue fake worker", exact: true }).click();
    await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
    const expected = { ...preview.document, delivery: "delivered" };
    const secondPage = await second.newPage(); await secondPage.goto("/"); await secondPage.reload();
    expect((await find(second)).document).toEqual(expected);
    const card = secondPage.locator("article").filter({ has: secondPage.getByRole("heading", { name: preview.title, exact: true }) });
    await expect(card).toContainText(preview.document.reference!);
    await page.goto("/"); await page.reload();
    expect((await find(page.context())).document).toEqual(expected);
    expect((await stranger.request.post("/api/session")).ok()).toBe(true);
    expect((await summaries(stranger)).some(job => job.id === jobId)).toBe(false);
    expect((await stranger.request.get(`/api/jobs?tenantId=${tenantId}&jobId=${jobId}`)).status()).toBe(404);
    expect((await stranger.request.get(`/api/jobs/${jobId}/quotes/delivery`)).status()).toBe(404);
  } finally { await second.close(); await stranger.close(); }
});
