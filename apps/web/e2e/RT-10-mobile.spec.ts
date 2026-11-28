import { readFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { ARTIFACT_DIR, HEAD_UNDER_TEST } from "../app/ui/rt10-mobile.fixtures";

test.skip(process.env.JOBGUARD_RT10 !== "1", "Opt in with JOBGUARD_RT10=1 using playwright.rt10.config.ts.");

// Component layout tests, not a deployed-flow acceptance run. SSR markup/CSS
// comes from this branch; the actual preview still runs b25b5ee9. No parse API,
// session creation or shared practice database is used. All HTTP is intercepted.
const origin = "https://sq-preview-jobguard-demo.ben2harwood.workers.dev";
const viewports = [
  { width: 360, height: 740 }, { width: 390, height: 844 },
  { width: 1280, height: 800 }, { width: 740, height: 360 },
];
async function mount(page: Page, screen: string) {
  const html = readFileSync(`${ARTIFACT_DIR}/${screen}.html`, "utf8");
  expect(html).toContain(`content="${HEAD_UNDER_TEST}"`);
  await page.route("**/*", route => {
    if (route.request().url() === `${origin}/__rt10_component/${screen}`) return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    return route.abort("blockedbyclient");
  });
  await page.goto(`/__rt10_component/${screen}`);
}
async function noHorizontalLoss(page: Page) {
  const measured = await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    // overflow-x:hidden can conceal content while the document reports no scroll.
    escaped: [...document.querySelectorAll<HTMLElement>("button,input,select,textarea,.room-head,.questions p,[data-testid=line-total],[data-testid=running-total],blockquote")]
      .filter(element => element.checkVisibility())
      .map(element => ({ name: element.getAttribute("aria-label") ?? element.textContent?.slice(0, 100), left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }))
      .filter(box => box.left < -1 || box.right > innerWidth + 1),
  }));
  expect(measured.scrollWidth).toBeLessThanOrEqual(measured.width);
  expect(measured.escaped).toEqual([]);
}
async function screenshot(page: Page, info: TestInfo, screen: string) {
  if ([360, 1280].includes(page.viewportSize()!.width)) {
    await info.attach(`${screen}-${page.viewportSize()!.width}-scale2`, { body: await page.screenshot(), contentType: "image/png" });
  }
}

for (const viewport of viewports) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    for (const count of [1, 10, 30, 100]) {
      test(`RT-10-layout-${count}: every panel and £125.00 remains reachable without horizontal loss`, async ({ page }, info) => {
        await mount(page, `lines-${count}`);
        await expect(page.locator("article.review-line")).toHaveCount(count);
        await expect(page.getByLabel(`Price Paint panel ${count}`, { exact: true })).toHaveValue("125.00");
        await expect(page.getByTestId("running-total")).toHaveText(`Total so far £${(count * 125).toLocaleString("en-GB", { minimumFractionDigits: 2 })} · complete`);
        await noHorizontalLoss(page);
        await screenshot(page, info, `lines-${count}-top`);
        await page.getByRole("button", { name: "Save review", exact: true }).scrollIntoViewIfNeeded();
        await expect(page.getByRole("button", { name: "Save review", exact: true })).toBeInViewport();
        await screenshot(page, info, `lines-${count}-save`);
      });
    }
    test("RT-10-long-layout: ten 500-character clauses and a 100-character room remain readable", async ({ page }, info) => {
      await mount(page, "long");
      await expect(page.locator("article.review-line")).toHaveCount(10);
      expect(await page.locator("input[aria-label^='Description ']").first().inputValue()).toHaveLength(500);
      await noHorizontalLoss(page);
      await screenshot(page, info, "long");
    });
    test("RT-10-question-layout: all twenty questions and labelled answers remain reachable", async ({ page }, info) => {
      await mount(page, "questions");
      await expect(page.locator(".questions input")).toHaveCount(20);
      for (let index = 1; index <= 20; index++) {
        const question = page.getByLabel(`Answer Which finish should I use on panel ${index}?`, { exact: true });
        await question.scrollIntoViewIfNeeded();
        await expect(question).toBeInViewport();
      }
      await noHorizontalLoss(page);
      await screenshot(page, info, "questions");
    });
    test("RT-10-money-layout: £999,999.99 fits the field and complete visible totals", async ({ page }, info) => {
      await mount(page, "maximum");
      const input = page.getByLabel("Price Paint panel 1", { exact: true });
      await expect(input).toHaveValue("999999.99");
      expect(await input.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(page.getByTestId("line-total")).toHaveText("Line total: £999,999.99");
      await expect(page.getByTestId("room-total")).toHaveText("£999,999.99");
      await expect(page.getByTestId("running-total")).toHaveText("Total so far £999,999.99 · complete");
      await noHorizontalLoss(page);
      await screenshot(page, info, "maximum");
    });
    for (const count of [1, 10, 30, 100]) {
      test(`RT-10-capture-${count}: typing and microphone actions fit and all words remain in the field`, async ({ page }, info) => {
        await mount(page, `capture-${count}`);
        const words = Array.from({ length: count }, (_, index) => `In the Kitchen. Paint panel ${index + 1} for £125.00.`).join("\n");
        await expect(page.getByLabel("Work details", { exact: false })).toHaveValue(words);
        await expect(page.getByRole("button", { name: "Talk through a quote", exact: true })).toBeVisible();
        await noHorizontalLoss(page);
        await screenshot(page, info, `capture-${count}`);
      });
    }
    test("RT-10-taps: buttons, fields and effective checkbox/radio labels provide 44px targets", async ({ page }) => {
      await mount(page, "lines-1");
      const small = await page.locator("button,input,select,textarea,summary").evaluateAll(elements => elements
        .filter(element => element.checkVisibility())
        .map(element => {
          // Clicking anywhere in an associated label toggles a checkbox/radio.
          const target = element.matches("input[type=checkbox],input[type=radio]") ? element.closest("label") ?? element : element;
          const box = target.getBoundingClientRect();
          return { name: element.getAttribute("aria-label") ?? element.textContent?.slice(0, 80), width: box.width, height: box.height };
        }).filter(box => box.width < 44 || box.height < 44));
      expect(small).toEqual([]);
    });
  });
}

test("RT-10-keyboard: price field remains visible in a reduced 360x340 editing viewport", async ({ page }) => {
  // Keyboard viewport approximation; no claim of an actual iOS/Android keyboard.
  await page.setViewportSize({ width: 360, height: 340 });
  await mount(page, "maximum");
  const input = page.getByLabel("Price Paint panel 1", { exact: true });
  await input.fill("125.50");
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport();
  await expect(input).toHaveValue("125.50");
  await noHorizontalLoss(page);
});

test("RT-10-zoom: 200% desktop layout equivalent (640 CSS px) retains exact money", async ({ page }) => {
  // 1280 / 2 CSS viewport tests reflow, not a physical browser zoom gesture.
  await page.setViewportSize({ width: 640, height: 400 });
  await mount(page, "maximum");
  await noHorizontalLoss(page);
  await expect(page.getByTestId("line-total")).toHaveText("Line total: £999,999.99");
});

test("RT-10-large-text: doubled computed text preserves prices, questions and source", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "questions");
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll<HTMLElement>("body *")].map(element => [element, parseFloat(getComputedStyle(element).fontSize)] as const);
    for (const [element, size] of sizes) element.style.setProperty("font-size", `${size * 2}px`, "important");
  });
  await noHorizontalLoss(page);
  await expect(page.locator(".questions input")).toHaveCount(20);
  await expect(page.getByLabel("Price Paint panel 20", { exact: true })).toHaveValue("125.00");
  const overflowingActions = await page.locator(".line-actions button").evaluateAll(buttons => buttons.flatMap(button => {
    const word = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (!word) return [];
    const range = document.createRange(); range.selectNodeContents(word);
    const text = range.getBoundingClientRect(), box = button.getBoundingClientRect();
    return text.left < box.left || text.right > box.right ? [{ action: word.textContent, textWidth: text.width, buttonWidth: box.width }] : [];
  }));
  await screenshot(page, info, "large-text");
  await info.attach("large-text-action-widths", { body: JSON.stringify(overflowingActions, null, 2), contentType: "application/json" });
  expect(overflowingActions).toEqual([]);
});
