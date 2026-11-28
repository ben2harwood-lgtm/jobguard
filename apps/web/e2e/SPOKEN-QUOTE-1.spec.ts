import { expect, test } from "@playwright/test";
import { draftSaveAndReopen, openNewJob, pinnedFixture, speechRequests, walkButtonsTall, type Row } from "./helpers/spoken-quote-journey";

// V2-SQ3 (Q61): each untouched transcript goes from one press of "Talk through a quote" to a saved quote
// that reopens unchanged, on the ordinary V2 New job route. Speech is injected as final words, byte for byte.
// The real recogniser on a recording is SPOKEN-QUOTE-REAL.spec.ts. Runs in the desktop and mobile-360 projects.
test.setTimeout(300_000);
const dir = "e2e/fixtures/spoken-quote";
const cases: { file: string; sha256: string; rows: Row[]; before: string; after: string; net: string; wholeJob?: string }[] = [
  { file: "1-four-items.txt", sha256: "5f3a4a30b1916d4d255ab1c6539e0a92db70d3c7111b1f507f20ca5aa3302ca7", rows: [
    { description: "strip out the old kitchen", quantity: "1", unit: "item", price: "", fill: "300" },
    { description: "fit six base units", quantity: "6", unit: "base units", price: "", fill: "50" },
    { description: "hang the new doors", quantity: "1", unit: "item", price: "", fill: "120" },
    { description: "paint the walls", quantity: "1", unit: "item", price: "", fill: "200" }],
    before: "Total so far £0.00 · incomplete: 4 rows need a price", after: "Total so far £920.00 · complete", net: "GBP 920.00" },
  { file: "2-two-prices-one-open.txt", sha256: "40a1da7b238172c465adb0914e96d37ac67db5adea627d2e86e7d921e6cc5e4b", rows: [
    { description: "strip out the old kitchen", quantity: "1", unit: "item", price: "200.00" },
    { description: "fit the new units", quantity: "1", unit: "item", price: "600.00" },
    { description: "paint the walls", quantity: "1", unit: "item", price: "", fill: "250" }],
    before: "Total so far £800.00 · incomplete: 1 row needs a price", after: "Total so far £1,050.00 · complete", net: "GBP 1,050.00" },
  { file: "3-two-sixty.txt", sha256: "1df2615f2c0296a46164bc4a32fe89725c7641670f60510d33dfbe2bf9b3c6f5", rows: [
    { description: "paint the walls", quantity: "1", unit: "item", price: "200.00" },
    { description: "fit the door", quantity: "1", unit: "item", price: "60.00" }],
    before: "Total so far £260.00 · complete", after: "Total so far £260.00 · complete", net: "GBP 260.00" },
  { file: "4-supply-and-fit.txt", sha256: "d237bee0a956e362f4b6cb24516e46e4ef7e6897c01f8aff898e01c3796fe08f", rows: [
    { description: "supply and fit one door", quantity: "1", unit: "door", price: "300.00" }],
    before: "Total so far £300.00 · complete", after: "Total so far £300.00 · complete", net: "GBP 300.00" },
  { file: "5-whole-job.txt", sha256: "f26ab24db1fd5b5a25963665d42356aa9af01ebc6271181ac5ee3ee9327f8fbb", rows: [
    { description: "strip out the old kitchen", quantity: "1", unit: "item", price: "", fill: "200" },
    { description: "fit the new units", quantity: "1", unit: "item", price: "", fill: "400" },
    { description: "paint the walls", quantity: "1", unit: "item", price: "", fill: "200" }],
    before: "Total so far £0.00 · incomplete: 3 rows need a price", after: "Total so far £800.00 · complete", net: "GBP 800.00",
    wholeJob: "You said “eight hundred pounds for the whole job”. It isn't added to any row." },
];

for (const example of cases) test(`spoken quote ${example.file} saves and reopens unchanged`, async ({ page }) => {
  const words = pinnedFixture(`${dir}/${example.file}`, example.sha256).toString("utf8");
  await page.addInitScript(text => {
    (window as any).__speechTest = { starts: 0, stops: 0 };
    (window as any).__JOBGUARD_SPEECH_ADAPTER__ = {
      configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
      available: async () => "installed", install: async () => true,
      start(callbacks: any) {
        (window as any).__speechTest.starts++;
        queueMicrotask(() => callbacks.final(text, "fixture-1"));
        return { stop() { (window as any).__speechTest.stops++; callbacks.end(); }, cancel() { callbacks.end(); } };
      },
    };
  }, words);
  const requests = speechRequests(page);
  await openNewJob(page);
  await walkButtonsTall(page);
  await page.getByRole("button", { name: "Talk through a quote", exact: true }).click();
  await expect(page.getByText("Listening on this device", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop listening", exact: true }).click();
  await expect(page.getByLabel("Words to review")).toHaveValue(words);
  await page.getByRole("button", { name: "Use these words", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__speechTest)).toEqual({ starts: 1, stops: 1 });
  const capture = await draftSaveAndReopen(page, { words, ...example, shot: `SPOKEN-QUOTE-1-${test.info().project.name}-${example.file.replace(/\.txt$/u, "")}` });
  expect(capture.source.kind).toBe("browser_local_transcript");
  expect(requests).toEqual([]);
});
