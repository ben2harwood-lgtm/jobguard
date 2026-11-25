import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const route = "/v2-mock-pages-3";
const practice = "Practice sandbox — synthetic data; nothing is sent or charged";
// Independent packet inventory: adding a fixture alone cannot remove a required state.
const states = {
  Tomorrow: ["Example", "Empty", "Problem", "Nothing for tomorrow"],
  "Your choices": ["Example", "Empty", "Problem", "Decided", "Link expired"],
  "Daywork sheet": ["Example", "Empty", "Problem", "Agreed", "Changed after sending"],
  "Certificates checklist": ["Example", "Empty", "Problem", "Job type has none"],
  Share: ["Example", "Empty", "Problem", "Phone cannot share"],
  Snags: ["Example", "Empty", "Problem"],
  Handover: ["Example", "Empty", "Problem"],
  "Your handover pack": ["Example", "Empty", "Problem", "Newer version available"],
};
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const nav = (page: Page) => page.getByRole("navigation", { name: "Mock-up pages" });
async function choose(page: Page, screen: string, view = "Example") {
  await nav(page).getByRole("button", { name: screen, exact: true }).click();
  await page.getByLabel("Preview state").selectOption(view);
}

if (process.env.JOBGUARD_LOCAL_V2 !== "1") {
  test("M3 is 404 without the local V2 flag", async ({ request }) => {
    const response = await request.get(route);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("Remaining screens mock-up");
  });
} else {
  test("all eight screens and every state at the packet viewport", async ({ page }) => {
    test.setTimeout(180_000);
    const outbound: string[] = [], mutations: string[] = [], errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const url = new URL(request.url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== new URL(page.url()).origin && page.url() !== "about:blank") outbound.push(request.url());
      if (request.method() !== "GET" || url.pathname.startsWith("/api/")) mutations.push(request.url());
    });
    await page.clock.setFixedTime(new Date("2026-11-30T12:00:00Z"));
    expect((await page.goto(route))?.status()).toBe(200);
    const main = page.getByRole("main");
    const content = page.getByTestId("screen-content");
    const width = page.viewportSize()!.width;

    for (const [screen, views] of Object.entries(states)) {
      await choose(page, screen);
      for (const view of views) {
        await page.getByLabel("Preview state").selectOption(view);
        await expect(main).toContainText(practice);
        await expect(content).not.toContainText(/\bsaved\b/i);
        if (view === "Empty") await expect(content.getByRole("heading")).toContainText(/No |Nothing /);
        if (view === "Problem" || view === "Link expired") await expect(content.getByRole("alert")).toContainText(/Nothing .*(recorded|sent)/);
        const customer = screen === "Your choices" || screen === "Your handover pack";
        await expect(page.locator("#sidebar, .rr-mobile-nav")).toHaveCount(customer ? 0 : 2);
        if (screen === "Your handover pack" || screen === "Handover" || screen === "Share" || screen === "Tomorrow") await expect(content).not.toContainText("£");
        for (const card of await main.getByTestId("crew-card").all()) await expect(card).not.toContainText("£");
        for (const button of await content.getByRole("button").all()) {
          const bounds = await button.boundingBox();
          expect(bounds?.height).toBeGreaterThanOrEqual(44);
          expect(bounds?.width).toBeGreaterThanOrEqual(44);
        }
        await expect.poll(() => main.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: resolve(__dirname, "artifacts/v2-mock-pages-3", `${slug(screen)}-${slug(view)}-${width}.png`), fullPage: true, animations: "disabled" });
      }
    }

    await choose(page, "Tomorrow");
    await expect(content.getByRole("heading", { name: "Ready", exact: true })).toBeVisible();
    await expect(content).toContainText("Unblock: confirm all six packs");
    await expect(content.getByRole("checkbox", { name: "Send at 6pm" })).toBeChecked();
    await expect(content.getByTestId("crew-card")).toHaveCount(2);
    await content.getByRole("button", { name: "Apply the swap" }).focus();
    await page.keyboard.press("Enter");
    await expect(content).toContainText("nobody has been told");
    await expect(content.getByRole("button", { name: "Apply the swap" })).toBeDisabled();
    await content.getByRole("button", { name: "Send a reminder" }).click();
    await expect(content).toContainText("Nothing was sent");

    await choose(page, "Your choices");
    await expect(content.getByRole("button", { name: "Choose tiles" })).toBeDisabled();
    await content.getByLabel("Tile finish").selectOption("sage");
    await content.getByRole("button", { name: "Choose tiles" }).click();
    await expect(content).toContainText("£35.00 over your allowance, sent to the builder as a change to approve");
    await expect(content).toContainText("not a committed price");
    await expect(content.getByRole("button", { name: "Choose tiles" })).toHaveCount(0);

    await choose(page, "Daywork sheet");
    for (const amount of ["6.50 hours", "7.25 hours", "2.50 bags", "£451.25"]) await expect(content).toContainText(amount);
    await content.getByRole("button", { name: "Ask the customer to agree by link" }).click();
    await expect(content).toContainText("no customer agreement recorded");
    await content.getByRole("button", { name: "Preview an edit after sending" }).click();
    await expect(content).toContainText("old link no longer works");
    await expect(content).toContainText("£481.25");
    await expect(content.getByRole("button", { name: "Ask the customer to agree by link" })).toBeEnabled();

    await choose(page, "Certificates checklist");
    await expect(content).toContainText("Minor Electrical Installation Works Certificate (BS 7671)");
    await expect(content).toContainText("only for notifiable work");
    await content.getByLabel("Minor Electrical Installation Works Certificate (BS 7671) status", { exact: true }).selectOption("Not needed");
    await expect(content.getByRole("alert")).toContainText("Give a reason");
    await content.getByLabel("Why is Minor Electrical Installation Works Certificate (BS 7671) not needed?", { exact: true }).fill("No electrical work on this job.");
    await expect(content.getByRole("alert")).toHaveCount(0);

    await choose(page, "Share", "Phone cannot share");
    const sharing = content.getByRole("region", { name: "Share Friday update" });
    await expect(sharing.getByTestId("share-text")).toContainText(practice);
    await sharing.getByRole("button", { name: "Copy text" }).click();
    await expect(sharing).toContainText("nothing copied");
    await sharing.getByRole("button", { name: "Open WhatsApp" }).click();
    await expect(sharing).toContainText("no app opened and nothing sent");
    const brief = content.locator("section.card").filter({ has: page.getByRole("heading", { name: "Crew brief", exact: true }) });
    await brief.getByRole("button", { name: "Share", exact: true }).click();
    await expect(brief.getByTestId("share-text")).toContainText("Sam · Decorator");
    await expect(brief.getByTestId("share-text")).not.toContainText("Lee");

    await choose(page, "Snags");
    const checked = content.getByRole("button", { name: "Mark checked" });
    await expect(checked).toBeDisabled();
    await content.getByRole("button", { name: "Mark fixed" }).click();
    await content.getByLabel("Checked by a second person").selectOption("Jordan");
    await expect(checked).toBeDisabled();
    await content.getByLabel("Checked by a second person").selectOption("Sam");
    await checked.click();
    await expect(content).toContainText("Checked: Sam · second person");
    await content.getByRole("button", { name: "Add a snag" }).click();
    await expect(content).toContainText("photo still needed");

    await choose(page, "Handover");
    await content.getByRole("checkbox", { name: "Photos", exact: true }).uncheck();
    await content.getByRole("button", { name: "Preview as the customer sees it" }).click();
    const preview = content.getByRole("region", { name: "Customer preview" });
    await expect(preview.getByRole("heading", { name: "Photos", exact: true })).toHaveCount(0);
    await expect(preview).not.toContainText("£");
    await expect(preview).toContainText("Outstanding snags");
    await content.getByRole("button", { name: "Release this version" }).click();
    await expect(content.getByRole("button", { name: "Release this version" })).toBeDisabled();
    await expect(content).toContainText("acknowledgement pending");
    await expect(content).toContainText("acknowledged by Alex, 2 Dec at 18:10");

    await choose(page, "Your handover pack", "Newer version available");
    await content.getByRole("button", { name: "Open newer version" }).click();
    await expect(content).toContainText("version 2");
    await expect(content).toContainText("does not agree the account or sign off any snag");
    await content.getByRole("button", { name: "Acknowledge receipt" }).click();
    await expect(content).toContainText("Receipt acknowledged in this preview for version 2");
    await expect(content).not.toContainText("£");
    await page.reload();
    await expect(main).toContainText("Remaining screens mock-up");
    await expect(page.getByLabel("Preview state")).toHaveValue("Example");
    await expect(main.getByRole("button", { name: "Apply the swap" })).toBeEnabled();
    expect(mutations).toEqual([]);
    expect(outbound).toEqual([]);
    expect(errors).toEqual([]);
  });
}
