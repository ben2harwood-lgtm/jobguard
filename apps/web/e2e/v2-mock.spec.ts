import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const enabled = process.env.JOBGUARD_LOCAL_V2 === "1";
const route = "/v2-mock";
const screens = ["Plan", "Measurements", "Materials", "Briefs"];

test("V2 Work mock-up returns 404 when local V2 is off", async ({ request }) => {
  test.skip(enabled);
  const response = await request.get(route);
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain("Work mock-up");
});

test("V2 Work screens and states are clickable", async ({ page }) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  const dataRequests: string[] = [];
  page.on("request", request => {
    if (["fetch", "xhr"].includes(request.resourceType())) dataRequests.push(request.url());
  });
  await page.clock.setFixedTime(new Date("2026-11-23T12:00:00Z"));
  expect((await page.goto(route))?.status()).toBe(200);
  const nav = page.getByRole("navigation", { name: "Work screens" });
  const state = page.getByLabel("Preview state");
  const width = page.viewportSize()!.width;
  const screenshot = async (screen: string, state: string) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.locator("main").evaluate(main => main.scrollWidth)).toBeLessThanOrEqual(width);
    const suffix = state === "Example" ? "" : `-${state.toLowerCase()}`;
    await page.screenshot({
      path: resolve(__dirname, "artifacts/v2-mock", `${screen.toLowerCase()}${suffix}-${width}.png`),
      fullPage: true,
      animations: "disabled",
      // Keep fixed mobile navigation below the content in full-page captures.
      style: "nextjs-portal { display: none; } .rr-mobile-nav { position: static !important; }",
    });
  };

  for (const screen of screens) {
    await nav.getByRole("button", { name: screen, exact: true }).click();
    await expect(page.getByRole("heading", { name: screen === "Briefs" ? "Tiler" : screen, exact: true })).toBeVisible();
    await screenshot(screen, "Example");
    await state.selectOption("Empty");
    await expect(page.getByRole("heading", { name: /^No .+ yet$/ })).toBeVisible();
    await screenshot(screen, "Empty");
    await state.selectOption("Problem");
    await expect(page.getByRole("alert").filter({ hasText: `${screen} could not open.` })).toContainText("The job is unchanged");
    await screenshot(screen, "Problem");
    await state.selectOption("Example");
  }

  for (const trade of ["Tiler", "Decorator"]) {
    await page.getByRole("button", { name: `View ${trade.toLowerCase()} brief` }).click();
    const brief = page.getByRole("dialog", { name: `${trade} brief` });
    await expect(brief).toContainText("Proof needed");
    await expect(brief.getByRole("img")).toHaveJSProperty("complete", true);
    expect(await brief.getByRole("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(brief).not.toContainText(/[£€$]/);
    await brief.getByRole("button", { name: "Close" }).click();
  }

  await nav.getByRole("button", { name: "Plan" }).click();
  await page.getByLabel("Preview plan status").selectOption("Draft");
  await expect(page.getByText("Draft plan")).toBeVisible();
  await page.getByLabel("Preview plan status").selectOption("Accepted");
  await page.getByRole("button", { name: "Edit task Prepare and tile the splashback" }).click();
  await page.getByLabel("Duration").fill("2 days");
  await page.getByRole("button", { name: "Apply in preview" }).click();
  await expect(page.getByText(/Tiler · 2 days/)).toBeVisible();
  await page.getByRole("button", { name: "Switch live" }).click();
  await expect(page.getByText("Live plan")).toBeVisible();

  await nav.getByRole("button", { name: "Measurements" }).click();
  await expect(page.getByText("How many metres of skirting and door trim need painting?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm measurement Paint hall woodwork" }).click();
  await page.getByLabel("Measured value (m)", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Confirm measurement", exact: true }).click();
  await expect(page.getByText("Hall · 12 m · Entered by builder")).toBeVisible();
  const tiles = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Tile the splashback" }) });
  await tiles.getByLabel("Product").selectOption("Sage ceramic wall tiles");
  await tiles.getByLabel("Pack size").selectOption("1.5 m²");
  await tiles.getByLabel("Wastage allowance").selectOption("15%");

  await nav.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(page.getByText("Out of date", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit material Sage ceramic wall tiles" }).click();
  await page.getByLabel("Needed by").fill("2027-12-02");
  await page.getByRole("button", { name: "Apply in preview" }).click();
  await expect(page.getByRole("heading", { name: /Needed by 2 Dec 2027/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Needed by 2 Dec 2026/ })).toBeVisible();
  await page.getByRole("button", { name: "Edit material Sage ceramic wall tiles" }).click();
  await page.getByLabel("Supplier", { exact: true }).fill("Rowan Merchant Trade Desk");
  await page.getByLabel("Needed by").fill("2026-12-01");
  await page.getByRole("button", { name: "Apply in preview" }).click();
  await expect(page.getByRole("heading", { name: "Rowan Merchant Trade Desk · Needed by 1 Dec 2026" })).toBeVisible();
  await page.getByRole("button", { name: "Edit material White matt emulsion" }).click();
  await page.getByLabel("Who supplies").selectOption("Customer");
  await page.getByRole("button", { name: "Apply in preview" }).click();
  await page.getByLabel("Enquiry notes").fill("Please confirm collection on Tuesday.");
  await page.getByRole("button", { name: "View enquiry" }).click();
  const enquiry = page.getByRole("dialog", { name: "Stock enquiry" });
  await expect(enquiry).toContainText("Unsent");
  await expect(enquiry).toContainText("Please confirm collection on Tuesday.");
  await expect(enquiry).toContainText("Sage ceramic wall tiles");
  await expect(enquiry).not.toContainText(/eggshell|emulsion/i);
  await enquiry.getByRole("button", { name: "Close" }).click();
  await page.reload();
  await expect(page.getByText("Accepted plan")).toBeVisible();
  expect(dataRequests).toEqual([]);
});
