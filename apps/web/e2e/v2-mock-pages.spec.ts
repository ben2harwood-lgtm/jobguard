import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.JOBGUARD_LOCAL_V2 === "1";
const route = "/v2-mock-pages";
const states = {
  "Friday update": ["Example", "Customer message", "Empty", "Problem"],
  "Reply page": ["Example", "Merchant question", "Already answered", "Question changed", "Link expired", "Empty", "Problem"],
  "RAMS draft": ["Example", "Signed", "Empty", "Problem"],
  "My brief": ["Example", "Blocked", "Changed", "No signal", "Empty", "Problem"],
} as const;
const byLink = (screen: string, view: string) => screen === "Reply page" || screen === "My brief" || view === "Customer message";
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const ramsWording = "Prepared by JobGuard from your plan. You must check and complete it. It is not a certificate.";

// Records any attempt to print or reach the camera; the mock must not open the camera, and Print
// is stubbed so no browser dialog opens.
async function watch(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "__calls", { value: calls });
    window.print = () => { calls.push("print"); };
    const media = navigator.mediaDevices;
    if (media) media.getUserMedia = async () => { calls.push("getUserMedia"); throw new Error("blocked in mock"); };
  });
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);

test("V2 new pages mock-up returns 404 when local V2 is off", async ({ request }) => {
  test.skip(enabled);
  const response = await request.get(route);
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain("New pages mock-up");
});

test("V2 Friday update, reply page, RAMS draft and My brief are clickable in every state", async ({ page }) => {
  test.skip(!enabled);
  test.setTimeout(180_000);
  const dataRequests: string[] = [];
  page.on("request", request => {
    if (["fetch", "xhr"].includes(request.resourceType())) dataRequests.push(request.url());
  });
  await watch(page);
  await page.clock.setFixedTime(new Date("2026-11-27T12:00:00Z"));
  expect((await page.goto(route))?.status()).toBe(200);
  const main = page.locator("main");
  const nav = page.getByRole("navigation", { name: "Mock-up pages" });
  const state = page.getByLabel("Preview state");
  const width = page.viewportSize()!.width;
  const screenshot = async (name: string) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await main.evaluate(node => node.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: resolve(__dirname, "artifacts/v2-mock-pages", `${name}-${width}.png`),
      fullPage: true,
      animations: "disabled",
      // Hide the Next.js dev indicator and keep fixed mobile navigation below the content.
      style: "nextjs-portal { display: none; } .rr-mobile-nav { position: static !important; }",
    });
  };

  // Every state of every page, captured before any interaction changes the fixture.
  for (const [screen, views] of Object.entries(states)) {
    await nav.getByRole("button", { name: screen, exact: true }).click();
    for (const view of views) {
      await state.selectOption(view);
      if (view === "Empty") await expect(main.getByRole("heading", { name: /^No .+( yet|here)$/ })).toBeVisible();
      else if (view === "Problem") await expect(main.getByRole("alert")).toContainText(/could not open\./);
      // Link pages carry no JobGuard menus and no sign-in; builder pages sit in the app shell.
      await expect(page.locator("#sidebar, .rr-mobile-nav")).toHaveCount(byLink(screen, view) ? 0 : 2);
      // No prices on any of these pages, in any state.
      await expect(main).not.toContainText("£");
      await screenshot(`${slug(screen)}${view === "Example" ? "" : `-${slug(view)}`}`);
    }
    await state.selectOption("Example");
  }
  await page.reload();

  // K3 Friday update: private photo never shows; edit, send once, edit makes a new version, hidden photo is left out.
  await expect(main.getByRole("heading", { name: "Friday update", exact: true })).toBeVisible();
  await expect(main).not.toContainText("damp patch");
  await expect(main.getByText("Not sent · version 1")).toBeVisible();
  for (const section of ["Done this week", "Next week", "Decisions needed from you", "Items you need to buy"]) {
    await expect(main.getByRole("heading", { name: section })).toBeVisible();
  }
  await main.getByRole("button", { name: "Edit Next week" }).click();
  await main.getByLabel("Next week").fill("Paint the hall on Mon 7 Dec.\nRefit the trim.");
  await main.getByRole("button", { name: "Save in preview" }).click();
  await expect(main.getByText("Paint the hall on Mon 7 Dec.")).toBeVisible();
  const send = main.getByRole("button", { name: "Send update" });
  await send.click();
  await expect(main.getByText("Sent in preview · version 1")).toBeVisible();
  await expect(send).toBeDisabled();
  await main.getByRole("button", { name: /^Hide .*hall walls prepared from the customer$/ }).click();
  await expect(main.getByText("Not sent · version 2")).toBeVisible();
  await expect(send).toBeEnabled();
  await main.getByRole("button", { name: "Preview as the customer sees it" }).click();
  await expect(page.locator("#sidebar, .rr-mobile-nav")).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Your Friday update" })).toBeVisible();
  await expect(main.getByText("Paint the hall on Mon 7 Dec.")).toBeVisible();
  await expect(main.getByRole("article", { name: /splashback tiled/ })).toBeVisible();
  await expect(main).not.toContainText("hall walls prepared");
  await expect(main).not.toContainText("damp patch");
  await expect(main).not.toContainText("£");
  // Each decision links to the reply page, so K3 and E2 agree on how a customer answers.
  await main.getByRole("button", { name: "Answer this question" }).click();
  await expect(nav.getByRole("button", { name: "Reply page" })).toHaveAttribute("aria-current", "page");
  await expect(main.getByRole("heading", { name: /hall radiator off the wall/ })).toBeVisible();

  // E2 reply page: one question, answer once, then "already answered"; changed question; expired link.
  await nav.getByRole("button", { name: "Reply page" }).click();
  const answer = main.getByRole("button", { name: "Send answer" });
  await expect(answer).toBeDisabled();
  await main.getByLabel("No, paint around it").check();
  await answer.click();
  await expect(main.getByText("Answer sent in this preview.")).toBeVisible();
  await expect(main.getByRole("radio")).toHaveCount(0);
  await state.selectOption("Already answered");
  await expect(main.getByText("Already answered.")).toBeVisible();
  await expect(main).toContainText("You chose “No, paint around it”");
  await state.selectOption("Merchant question");
  await expect(main.getByRole("heading", { name: /6 packs of white ceramic wall tiles/ })).toBeVisible();
  await expect(main.getByRole("radio")).toHaveCount(3);
  await state.selectOption("Question changed");
  await expect(main.getByText("This question has changed since the link was sent.")).toBeVisible();
  await state.selectOption("Link expired");
  await expect(main.getByRole("alert")).toContainText("Nothing was recorded.");
  await expect(main.getByRole("radio")).toHaveCount(0);

  // K9 RAMS draft: fixed wording, edit a section, sign only once completed, plan change makes a new draft.
  await nav.getByRole("button", { name: "RAMS draft" }).click();
  await expect(main.getByRole("note")).toContainText(ramsWording);
  await expect(main).toContainText("Dust from tile cutting");
  await expect(main).toContainText("Occupied home");
  await main.getByRole("button", { name: "Print" }).click();
  expect(await calls(page)).toContain("print");
  await main.getByRole("button", { name: "Edit Site rules and welfare" }).click();
  await main.getByLabel("Site rules and welfare").fill("Ring the front bell on arrival.\nUse the downstairs toilet, agreed with the customer.");
  await main.getByRole("button", { name: "Save in preview" }).click();
  const sign = main.getByRole("button", { name: "Sign this version" });
  await main.getByLabel("Your name").fill("Jordan Hale");
  await main.getByLabel(/I have checked every section/).check();
  await expect(sign).toBeDisabled();
  await expect(main.getByText("Complete Nearest A&E and First aider on site before you sign.")).toBeVisible();
  // An editor left open when signing closes, so a signed version cannot change.
  await main.getByRole("button", { name: "Edit Occupied home" }).click();
  await main.getByLabel("Nearest A&E").fill("Rowan General Hospital (fictional)");
  await main.getByLabel("First aider on site").fill("Jordan Hale");
  await sign.click();
  await expect(main.getByText("Signed · version 1")).toBeVisible();
  await expect(main.getByRole("button", { name: /^Edit / })).toHaveCount(0);
  await expect(main.getByRole("button", { name: "Save in preview" })).toHaveCount(0);
  await expect(main.getByRole("textbox", { name: "Occupied home" })).toHaveCount(0);
  await expect(main.getByLabel("Nearest A&E")).toHaveAttribute("readonly", "");
  await main.getByRole("button", { name: "Preview a plan change" }).click();
  await expect(main.getByText("Draft · version 2")).toBeVisible();
  await expect(main.getByText("Version 1, signed by Jordan Hale, is kept unchanged and read-only.")).toBeVisible();
  await expect(main.getByText("Check: plan changed")).toBeVisible();
  await expect(main.getByText("Your edit")).toBeVisible();
  await expect(main.getByText("Use the downstairs toilet, agreed with the customer.")).toBeVisible();

  // F1 My brief: Blocked needs a reason, Changed records only, Done carries proof references; no signal sends nothing.
  await nav.getByRole("button", { name: "My brief" }).click();
  await expect(page.locator("#sidebar, .rr-mobile-nav")).toHaveCount(0);
  await expect(main.getByRole("article", { name: "Illustrative kitchen photo" })).toBeVisible();
  const tile = main.locator("section.card").filter({ has: page.getByRole("heading", { name: "Prepare and tile the splashback" }) });
  const grout = main.locator("section.card").filter({ has: page.getByRole("heading", { name: "Grout the splashback" }) });
  await tile.getByRole("button", { name: "Blocked" }).click();
  const blocked = tile.getByRole("button", { name: "Send blocked" });
  await expect(blocked).toBeDisabled();
  await tile.getByLabel("Why is it blocked?").selectOption("Materials not here");
  await tile.getByLabel("What would unblock it? (optional)").fill("Tiles arrive at 11:00.");
  await blocked.click();
  await expect(main.getByRole("article", { name: "Blocked: Prepare and tile the splashback" })).toContainText("Materials not here · Tiles arrive at 11:00.");
  await expect(main.getByText("Nothing was sent to the builder or written to the job diary.")).toBeVisible();
  await grout.getByRole("button", { name: "Changed" }).click();
  await expect(grout.getByText("This does not change the scope, the price or any order.")).toBeVisible();
  await grout.getByLabel("What changed on site?").fill("Customer asked for grey grout on the window return.");
  await grout.getByRole("button", { name: "Send change note" }).click();
  await expect(main.getByRole("article", { name: "Changed: Grout the splashback" })).toContainText("grey grout");
  await tile.getByLabel("Prepared wall photo").selectOption({ label: "Illustrative photo · prepared kitchen wall" });
  await expect(tile.getByText("Prepared wall · reference to job photo m4")).toBeVisible();
  await tile.getByRole("button", { name: "Done" }).click();
  await expect(tile.getByText("Done", { exact: true })).toBeVisible();
  await expect(main.getByRole("article", { name: "Done: Prepare and tile the splashback" })).toContainText("Proof: job photo m4");
  await state.selectOption("No signal");
  await expect(main.getByText("No signal.", { exact: true })).toBeVisible();
  await expect(grout.getByRole("button", { name: "Done" })).toBeDisabled();
  await expect(grout.getByRole("button", { name: "Blocked" })).toBeDisabled();
  await expect(grout.getByRole("button", { name: "Changed" })).toBeDisabled();
  await expect(main).not.toContainText("£");

  expect(dataRequests).toEqual([]);
  expect((await calls(page)).filter(call => call !== "print")).toEqual([]);
});
