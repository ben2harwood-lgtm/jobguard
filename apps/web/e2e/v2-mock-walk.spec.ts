import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.JOBGUARD_LOCAL_V2 === "1";
const route = "/v2-mock-walk";
const states = {
  Walk: ["Example", "Microphone refused", "Camera refused", "No signal", "Empty", "Problem"],
  "Check the walk": ["Example", "After a move", "Empty", "Problem"],
} as const;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// Records any attempt to reach the real camera or microphone; the mock must make none.
async function watchDevices(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "__deviceCalls", { value: calls });
    const media = navigator.mediaDevices;
    if (media) media.getUserMedia = async () => { calls.push("getUserMedia"); throw new Error("blocked in mock"); };
    const speech = window as unknown as Record<string, unknown>;
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
      speech[name] = class { constructor() { calls.push(name); } };
    }
  });
}

test("V2 Walk mock-up returns 404 when local V2 is off", async ({ request }) => {
  test.skip(enabled);
  const response = await request.get(route);
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain("Walk mock-up");
});

test("V2 Walk and Check the walk screens and states are clickable", async ({ page }) => {
  test.skip(!enabled);
  test.setTimeout(120_000);
  const dataRequests: string[] = [];
  page.on("request", request => {
    if (["fetch", "xhr"].includes(request.resourceType())) dataRequests.push(request.url());
  });
  await watchDevices(page);
  await page.clock.setFixedTime(new Date("2026-11-24T12:00:00Z"));
  expect((await page.goto(route))?.status()).toBe(200);
  const nav = page.getByRole("navigation", { name: "Walk screens" });
  const state = page.getByLabel("Preview state");
  const width = page.viewportSize()!.width;
  const screenshot = async (screen: string, view: string) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.locator("main").evaluate(main => main.scrollWidth)).toBeLessThanOrEqual(width);
    const suffix = view === "Example" ? "" : `-${slug(view)}`;
    await page.screenshot({
      path: resolve(__dirname, "artifacts/v2-mock-walk", `${slug(screen)}${suffix}-${width}.png`),
      fullPage: true,
      animations: "disabled",
      // Keep fixed mobile navigation below the content in full-page captures.
      style: "nextjs-portal { display: none; } .rr-mobile-nav { position: static !important; }",
    });
  };

  // Every state of both screens, captured before any interaction changes the fixture.
  for (const [screen, views] of Object.entries(states)) {
    await nav.getByRole("button", { name: screen, exact: true }).click();
    for (const view of views) {
      await state.selectOption(view);
      if (view === "Empty") await expect(page.getByRole("heading", { name: /^No .+ yet$/ })).toBeVisible();
      else if (view === "Problem") await expect(page.getByRole("alert").filter({ hasText: `${screen} could not open.` })).toContainText("Nothing you saved has changed");
      else await expect(page.getByRole("heading", { name: "Kitchen", exact: true })).toBeVisible();
      await screenshot(screen, view);
    }
    await state.selectOption("Example");
  }
  // Start the interactions from the untouched fixture.
  await page.reload();

  // Walk: dictate, edit, add a note, take a photo, change room.
  await nav.getByRole("button", { name: "Walk", exact: true }).click();
  await expect(page.getByRole("heading", { name: "So far in Kitchen" })).toBeVisible();
  await page.getByRole("button", { name: "Dictate" }).click();
  const kitchenNote = page.getByLabel("Note for Kitchen");
  await expect(kitchenNote).toHaveValue(/Socket above the worktop/);
  await expect(page.getByText("Words from dictation. Check and edit them before adding.")).toBeVisible();
  await kitchenNote.fill("Socket above the worktop needs two tile cuts.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("article").filter({ hasText: "needs two tile cuts" })).toContainText("Saved");
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByRole("article", { name: /end of the worktop \(1\)/ })).toContainText("Saved");
  await page.getByRole("button", { name: "Next room" }).click();
  await expect(page.getByRole("heading", { name: "Hall", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next room" })).toBeDisabled();
  await page.getByLabel("Current room").selectOption("Kitchen");
  await expect(page.getByRole("heading", { name: "So far in Kitchen" })).toBeVisible();

  // An unsent draft stays with its own room when the room changes.
  await page.getByLabel("Note for Kitchen").fill("Kitchen draft not added yet.");
  await page.getByRole("button", { name: "Next room" }).click();
  await expect(page.getByLabel("Note for Hall")).toHaveValue("");
  await page.getByLabel("Note for Hall").fill("Hall draft.");
  await page.getByLabel("Current room").selectOption("Kitchen");
  await expect(page.getByLabel("Note for Kitchen")).toHaveValue("Kitchen draft not added yet.");
  // Unsent drafts block Finish walk and survive a state change.
  await expect(page.getByRole("button", { name: "Finish walk" })).toBeDisabled();
  await expect(page.getByText("Add or clear the unsent note in Kitchen and Hall before you finish.")).toBeVisible();
  await state.selectOption("Problem");
  await state.selectOption("Example");
  await expect(page.getByLabel("Note for Kitchen")).toHaveValue("Kitchen draft not added yet.");
  await page.getByLabel("Note for Kitchen").fill("");
  await page.getByLabel("Current room").selectOption("Hall");
  await page.getByLabel("Note for Hall").fill("");
  await page.getByLabel("Current room").selectOption("Kitchen");
  await expect(page.getByRole("button", { name: "Finish walk" })).toBeEnabled();

  // Microphone refused: typed notes still work.
  await state.selectOption("Microphone refused");
  await expect(page.getByText("Microphone not allowed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dictate" })).toBeDisabled();
  await page.getByLabel("Note for Kitchen").fill("Typed while the microphone is off.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Typed while the microphone is off." })).toBeVisible();

  // Camera refused: no photo button, notes still work.
  await state.selectOption("Camera refused");
  await expect(page.getByText("Camera not allowed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeDisabled();
  await page.getByLabel("Note for Kitchen").fill("Typed while the camera is off.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Typed while the camera is off." })).toContainText("Saved");

  // No signal: new items are pending, confirmed items stay saved, Finish waits.
  await state.selectOption("No signal");
  await expect(page.getByText("No signal.", { exact: true })).toBeVisible();
  await page.getByLabel("Note for Kitchen").fill("Added with no signal.");
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByRole("button", { name: "Take photo" }).click();
  const offlineNote = page.getByRole("article").filter({ hasText: "Added with no signal." });
  await expect(offlineNote).toContainText("Not saved yet");
  await expect(offlineNote).not.toContainText(/\bSaved\b/);
  await expect(page.getByRole("article", { name: /end of the worktop \(2\)/ })).toContainText("Not saved yet");
  await expect(page.getByRole("article").filter({ hasText: "Splashback runs the full length" })).toContainText("Saved");
  await expect(page.getByText("3 not saved yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish walk" })).toBeDisabled();
  await state.selectOption("Example");
  await expect(offlineNote).toContainText("Saved");
  await expect(page.getByText("All saved")).toBeVisible();
  await page.getByRole("button", { name: "Finish walk" }).click();

  // Check the walk: unclear link, move, needs-room tray, confirm.
  await expect(nav.getByRole("button", { name: "Check the walk" })).toHaveAttribute("aria-current", "page");
  const confirm = page.getByRole("button", { name: "Confirm walk" });
  await expect(confirm).toBeDisabled();
  await expect(page.getByText(/2 photos still need a room · 1 unclear link to check/)).toBeVisible();
  const trim = page.getByRole("article", { name: /loose trim at the sink end/ });
  await expect(trim).toContainText("Check room");
  await page.getByRole("button", { name: /^Move photo .*loose trim/ }).click();
  await trim.getByLabel("Move to").selectOption("Kitchen");
  await trim.getByRole("button", { name: "Move in preview" }).click();
  const kitchen = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Kitchen", exact: true }) });
  const moved = kitchen.getByRole("article", { name: /loose trim at the sink end/ });
  await expect(moved).toContainText("Original link: Hall (photo 3 in the walk)");
  await expect(moved).toContainText("Moved from Hall to Kitchen");
  await expect(moved).not.toContainText("Check room");
  const tray = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Needs room" }) });
  await expect(tray.getByRole("article")).toHaveCount(2);
  for (const [photo, to] of [["kitchen layout sketch", "Kitchen"], ["site entrance", "Hall"]] as const) {
    await page.getByRole("button", { name: new RegExp(`^Move photo .*${photo}`) }).click();
    await tray.getByLabel("Move to").selectOption(to);
    await tray.getByRole("button", { name: "Move in preview" }).click();
    await expect(page.locator("section.card").filter({ has: page.getByRole("heading", { name: to, exact: true }) })
      .getByRole("article", { name: new RegExp(photo) })).toContainText(`Assigned from Needs room to ${to}`);
  }
  await expect(tray).toContainText("Nothing waiting for a room.");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText("Walk confirmed in this preview.")).toBeVisible();

  // A fresh preview shows the "After a move" state with both the original and corrected link.
  await page.reload();
  await nav.getByRole("button", { name: "Check the walk" }).click();
  await state.selectOption("After a move");
  const after = page.getByRole("article", { name: /loose trim at the sink end/ });
  await expect(after).toContainText("Original link: Hall");
  await expect(after).toContainText("Moved from Hall to Kitchen");

  expect(dataRequests).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __deviceCalls: string[] }).__deviceCalls)).toEqual([]);
});
