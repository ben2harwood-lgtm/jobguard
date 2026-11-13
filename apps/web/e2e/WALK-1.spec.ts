import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("WALK-1 core instruction tour (job actions are wired by WALK-3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demo-s/core-1000");
    for (let i = 0; i < 9; i++) await expect(page.locator(`#core-guide-${i}`)).toHaveAttribute("open", "");
    await page.getByRole("button", { name: "Tour the core guide instructions" }).click();
  });
  test("handled Escape leaves the tour open; closing restores the open guide", async ({ page }) => {
    const card = page.getByRole("region", { name: "Guided walkthrough" });
    await card.evaluate(element => element.addEventListener("keydown", event => {
      if ((event as KeyboardEvent).key === "Escape") event.preventDefault();
    }, { once: true }));
    await page.keyboard.press("Escape");
    await expect(card).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
    for (let i = 0; i < 9; i++) await expect(page.locator(`#core-guide-${i}`)).toHaveAttribute("open", "");
    await page.getByRole("button", { name: "Tour the core guide instructions" }).click();
    await expect(card.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  });
  test("Escape in native and ARIA dialogs leaves the tour open", async ({ page }) => {
    const tour = page.getByRole("region", { name: "Guided walkthrough" });
    await page.evaluate(() => {
      const dialog = document.createElement("dialog");
      dialog.id = "escape-test"; dialog.innerHTML = '<button>Dialog action</button>';
      document.body.append(dialog); dialog.showModal();
    });
    await page.keyboard.press("Escape");
    await expect(page.locator("#escape-test")).not.toBeVisible();
    await expect(tour).toBeVisible();
    await page.evaluate(() => {
      const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog");
      dialog.innerHTML = '<button>ARIA dialog action</button>'; document.body.append(dialog);
      dialog.querySelector("button")!.focus();
    });
    await page.keyboard.press("Escape"); await expect(tour).toBeVisible();
    await page.getByRole("button", { name: "ARIA dialog action" }).evaluate(element => element.parentElement!.remove());
    await tour.focus(); await page.keyboard.press("Escape"); await expect(tour).toHaveCount(0);
  });
  test("all nine real targets are visible and keyboard operation reaches the end", async ({ page }) => {
    const card = page.getByRole("region", { name: "Guided walkthrough" });
    for (let index = 0; index < 9; index++) {
      await expect(card.getByRole("heading")).toContainText(`Step ${index + 1} of 9`);
      const target = page.locator(`#core-guide-${index} > summary`);
      await expect(target).toBeVisible(); await expect(target).toBeInViewport();
      await expect(card.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
      await card.getByRole("button", { name: "I'll do it" }).click();
      await expect(target).toBeFocused(); await page.keyboard.press("Enter");
    }
    await expect(card.getByRole("heading")).toHaveText("Tour complete");
    await expect(card).toContainText("Only the real screens and saved records establish job progress");
  });
  test("Show me opens a real control; Back preserves it; playback reaches the end", async ({ page }) => {
    const card = page.getByRole("region", { name: "Guided walkthrough" });
    await card.getByRole("button", { name: "Show me", exact: true }).click();
    await expect(page.locator("#core-guide-0")).toHaveAttribute("open", "");
    await expect(card.getByRole("heading")).toContainText("Step 2 of 9");
    await card.getByRole("button", { name: "Back", exact: true }).click();
    await expect(card.getByRole("heading")).toContainText("Step 1 of 9");
    await expect(page.locator("#core-guide-0")).toHaveAttribute("open", "");
    await card.getByRole("button", { name: "Play the whole thing" }).click();
    await expect(card.getByRole("heading")).toHaveText("Tour complete", { timeout: 20_000 });
    for (let i = 0; i < 9; i++) await expect(page.locator(`#core-guide-${i}`)).toHaveAttribute("open", "");
  });
  test("missing targets cannot advance and Escape restores launch focus and styles", async ({ page }) => {
    const card = page.getByRole("region", { name: "Guided walkthrough" });
    await page.locator("#core-guide-0").evaluate(element => { (element as HTMLElement).hidden = true; });
    await expect(card.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await expect(card.getByText("Waiting for this step's control to become visible.")).toBeVisible();
    await page.keyboard.press("Escape"); await expect(card).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tour the core guide instructions" })).toBeFocused();
    expect(await page.locator("body").evaluate(element => element.style.paddingBottom)).toBe("");
    expect(await page.locator("summary").first().getAttribute("class") ?? "").not.toContain("target");
  });
  test("an action with no real completion stops and never claims success", async ({ page }) => {
    await page.locator("#core-guide-0 > summary").evaluate(element => element.addEventListener("click", event => event.preventDefault()));
    const card = page.getByRole("region", { name: "Guided walkthrough" });
    await card.getByRole("button", { name: "Play the whole thing" }).click();
    await expect(card.getByRole("alert")).toContainText("has not been confirmed", { timeout: 16_000 });
    await expect(card.getByRole("heading")).toContainText("Step 1 of 9");
    await expect(card.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  });
  test("reduced motion, screen-reader labels and contrast remain usable", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const target = page.locator("#core-guide-0 > summary");
    await expect(target).toHaveCSS("transform", "none");
    const results = await new AxeBuilder({ page }).include('[aria-label="Guided walkthrough"]').analyze();
    expect(results.violations).toEqual([]);
    await page.getByRole("button", { name: "Play the whole thing" }).click();
    await expect(page.getByRole("heading", { name: "Tour complete" })).toBeVisible();
    await page.screenshot({ path: `test-results/WALK-1-${test.info().project.name}.png` });
  });
  test("stopping playback cancels a pending pointer action", async ({ page }) => {
    const card = page.getByRole("region", { name: "Guided walkthrough" });
    await card.getByRole("button", { name: "Play the whole thing" }).click();
    await card.getByRole("button", { name: "Stop playback" }).click();
    await expect(card.getByRole("button", { name: "Show me", exact: true })).toBeEnabled();
    await expect(page.locator("#core-guide-0")).not.toHaveAttribute("open", "");
    await expect(card.getByRole("heading")).toContainText("Step 1 of 9");
  });
});
