import { expect, test } from "@playwright/test";
test.use({ headless: true });
// Transport-mocked screen journey: deliberately independent of the not-yet-landed POST.
// Both mobile-360 and desktop run from the existing Playwright projects, headless.
const job = "00000000-0000-4000-8000-000000000001", evidenceId = "00000000-0000-4000-8000-000000000002";
const source = { evidenceId, sha256: "c".repeat(64), objectVersion: "stored-photo-version", mediaKind: "completion_photo", photoTags: ["Fictional new vent"], capturedAt: "2026-11-04T05:00:00Z" };
const path = `/api/contractor/jobs/${job}/possible-extras`;
test("records exact stored citations, preserves uncertain retry and shows text refusal", async ({ page }) => {
 await page.route(`**${path}/evidence`, route => route.fulfill({ json: { version: "observation-evidence.v1", items: [source, { ...source, evidenceId: job, mediaKind: "completion_note", photoTags: [] }] } }));
 const commands: Record<string, unknown>[] = [];
 await page.route(`**${path}/observations`, async route => {
  const body = route.request().postDataJSON() as Record<string, unknown>; commands.push(body);
  if (commands.length === 1) return route.abort("failed");
  if (commands.length === 2) return route.fulfill({ status: 201, json: { observationId: evidenceId, evaluation: {} } });
  return route.fulfill({ status: 409, json: { version: "enterprise-live-prompt-error.v1", code: "PROMPT_SOURCE_INVALID" } });
 });
 await page.goto(`/contractor/jobs/${job}/completion-observations`);
 const main = page.getByRole("main");
 await main.getByLabel("Completion evidence").selectOption(evidenceId);
 await main.getByLabel("Stored photo tag").selectOption("Fictional new vent");
 await main.getByLabel("Work identity", { exact: true }).fill("FIT-VENT");
 // Native accessibility tree: every exposed input/control has its expected name;
 // verify keyboard operability, landmarks, contrast and touch targets in-browser.
 await expect(main.getByRole("heading", { name: "Completion observations", level: 1 })).toBeVisible();
 for (const [role, name] of [["combobox", "Completion evidence"], ["combobox", "Stored photo tag"], ["textbox", "Work identity"], ["button", "Record observation"]] as const) {
  const target = main.getByRole(role, { name, exact: true });
  await expect(target).toBeVisible(); const box = await target.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
 }
 await main.getByLabel("Work identity", { exact: true }).focus();
 await page.keyboard.press("Tab"); await expect(main.getByRole("button", { name: "Record observation", exact: true })).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(main.getByRole("status")).toContainText("uncertain");
 await expect(main.getByLabel("Work identity", { exact: true })).toBeDisabled();
 await main.getByRole("button", { name: "Retry same observation" }).click();
 await expect(main.getByRole("status")).toContainText(`Observation recorded. Reference: ${evidenceId}`);
 expect(commands[0]).toEqual(commands[1]);
 expect(commands[0]).toEqual({ version: "completion-observation.v1", commandId: expect.any(String), evidenceId, sha256: source.sha256, objectVersion: source.objectVersion, workIdentity: "FIT-VENT", locator: { kind: "photo_tag", tag: "Fictional new vent" } });
 await main.getByRole("button", { name: "Record another observation" }).click();
 await main.getByLabel("Completion evidence").selectOption(job);
 await main.getByLabel("Exact source text", { exact: true }).fill("new vent");
 await main.getByLabel("Exact quote", { exact: true }).fill("vent");
 await main.getByLabel("Start offset").fill("4"); await main.getByLabel("End offset").fill("8");
 await main.getByLabel("Work identity", { exact: true }).fill("FIT-VENT");
 for (const input of await main.locator("input,textarea,select,button").all()) {
  const box = await input.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
 }
 await main.getByRole("button", { name: "Record observation", exact: true }).click();
 await expect(main.getByRole("status")).toContainText("server refused this evidence");
 await expect(main.getByLabel("Exact source text", { exact: true })).toHaveValue("new vent");
 expect(commands[2]).toMatchObject({ sourceText: "new vent", locator: { kind: "text_span", quote: "vent", start: 4, end: 8 } });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
 // Detect serious semantic failures without fetching/injecting third-party code.
 const semanticFailures = await main.evaluate(root => {
  const failures: string[] = [];
  for (const el of root.querySelectorAll("input,select,textarea")) {
   if (!(el as HTMLInputElement).labels?.length) failures.push("unlabelled control");
  }
  // WCAG text contrast for enabled controls and visible copy, including inherited backgrounds.
  const rgb = (color: string) => (color.match(/[\d.]+/gu) ?? []).map(Number);
  const luminance = (color: number[]) => color.slice(0, 3).reduce((sum, n, i) => {
   const channel = n / 255;
   return sum + [0.2126, 0.7152, 0.0722][i]! * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  }, 0);
  for (const el of root.querySelectorAll("label,p,h1,input,textarea,select,button")) {
   if (el.matches(":disabled") || !el.getClientRects().length) continue;
   let ancestor: Element | null = el, background = [255, 255, 255];
   while (ancestor) {
    const candidate = rgb(getComputedStyle(ancestor).backgroundColor);
    if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break; }
    ancestor = ancestor.parentElement;
   }
   const foreground = luminance(rgb(getComputedStyle(el).color)), back = luminance(background);
   if ((Math.max(foreground, back) + 0.05) / (Math.min(foreground, back) + 0.05) < 4.5) failures.push("insufficient text contrast");
  }
  if (!document.documentElement.lang) failures.push("missing document language");
  if (document.querySelectorAll("main").length !== 1) failures.push("ambiguous main landmark");
  return failures;
 });
 expect(semanticFailures).toEqual([]);
});
