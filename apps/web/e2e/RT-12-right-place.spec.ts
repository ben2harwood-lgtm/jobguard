import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// RT-12: independent expectations transcribed from the builder's words, not parser output.
// Hosted only. No microphone, model API, confirmation, deployment or local web server.
const ORIGIN = "https://sq-preview-jobguard-demo.ben2harwood.workers.dev";
const HEAD_UNDER_TEST = "b25b5ee9";
const WORKER = "d7b174a0";
// Identity supplied by preview owner; asset fingerprint detects a changed deployment during this run.
const ENTRY_ASSET_SHA256 = "44f496ea4730dbf34bfbac9175f6e8905a94375e1b3a89b0488a2b7eed338aad";
const canonicalRoom = (name: string) => name.toLowerCase().replace(/\bbedroom two\b/u, "bedroom 2");
type Line = { description: string; room: string; trade: string; quantity: string; unit: string; price: string };
type Quote = { id: string; words: string; lines: Line[]; questions: RegExp[]; whole?: { words: RegExp; pence: number }; roomPrice?: { room: string; pence: number }; alternativePrices?: Record<number, string[]>; known?: string };
const line = (description: string, trade: string, price = "", room = "Whole job", quantity = "1", unit = "item"): Line =>
  ({ description, room, trade, quantity, unit, price });
const fixture = (name: string) => readFileSync(resolve(`e2e/fixtures/spoken-quote/${name}.txt`), "utf8");
const cases: Quote[] = [
  { id: "01-four-items", words: fixture("1-four-items"), lines: [
    line("strip out the old kitchen", "Strip-out", "", "Kitchen"),
    line("fit six base units", "Kitchen fitting", "", "Kitchen", "6", "base units"),
    line("hang the new doors", "Carpentry", "", "Kitchen"), line("paint the walls", "Decorating", "", "Kitchen")], questions: [] },
  { id: "02-two-prices-open", words: fixture("2-two-prices-one-open"), lines: [
    line("strip out the old kitchen", "Strip-out", "200.00", "Kitchen"),
    line("fit the new units", "Kitchen fitting", "600.00", "Kitchen"), line("paint the walls", "Decorating", "", "Kitchen")], questions: [] },
  { id: "03-two-sixty", words: fixture("3-two-sixty"), lines: [line("paint the walls", "Decorating", "200.00"), line("fit the door", "Carpentry", "60.00")], questions: [] },
  { id: "04-supply-fit", words: fixture("4-supply-and-fit"), lines: [line("supply and fit one door", "Carpentry", "300.00", "Whole job", "1", "door")], questions: [], known: "F-005" },
  { id: "05-whole-job", words: fixture("5-whole-job"), lines: [line("strip out the old kitchen", "Strip-out", "", "Kitchen"),
    line("fit the new units", "Kitchen fitting", "", "Kitchen"), line("paint the walls", "Decorating", "", "Kitchen")],
    questions: [/eight hundred pounds.*whole job/iu], whole: { words: /eight hundred pounds for the whole job/iu, pence: 80000 } },
  { id: "06-money-words", words: "Fit the door for one hundred and fifty pounds.", lines: [line("Fit the door", "Carpentry", "150.00")], questions: [] },
  { id: "07-thousand", words: "Paint the walls for one thousand two hundred and fifty pounds.", lines: [line("Paint the walls", "Decorating", "1250.00")], questions: [] },
  { id: "08-vat", words: "Paint the walls for £400 plus VAT.", lines: [line("Paint the walls", "Decorating")], questions: [/VAT/iu] },
  { id: "09-materials", words: "Fit the door for £200 plus materials.", lines: [line("Fit the door", "Carpentry")], questions: [/materials/iu] },
  { id: "10-correction", words: "Paint the walls for £400, no, make that £450.", lines: [line("Paint the walls", "Decorating")], questions: [/400.*450/iu], alternativePrices: { 0: ["", "450.00"] } },
  { id: "11-room-return", words: "In the kitchen. Fit the units for £600. In the bathroom. Tile the floor for £200. Back in the kitchen. Paint the walls for £150.", lines: [
    line("Fit the units", "Kitchen fitting", "600.00", "Kitchen"), line("Tile the floor", "Tiling", "200.00", "Bathroom"), line("Paint the walls", "Decorating", "150.00", "Kitchen")], questions: [] },
  { id: "12-bedroom-two", words: "Bedroom two. Paint the walls for £500.", lines: [line("Paint the walls", "Decorating", "500.00", "Bedroom 2")], questions: [] },
  { id: "13-credit", words: "Fit the door for £300. Credit £50 for the old door.", lines: [line("Fit the door", "Carpentry", "300.00"), line("Credit", "Carpentry")], questions: [/credit.*50/iu] },
  { id: "14-range", words: "Paint the walls for between £300 and £400.", lines: [line("Paint the walls", "Decorating")], questions: [/300.*400/iu] },
  { id: "15-total-mismatch", words: "Paint the walls for £200 and fit the door for £60. £300 for the whole job.", lines: [line("Paint the walls", "Decorating", "200.00"), line("fit the door", "Carpentry", "60.00")],
    questions: [/300.*(?:whole job|total)/iu, /(?:differ|match|260|add up)/iu], whole: { words: /300 for the whole job/iu, pence: 30000 } },
  { id: "16-euro", words: "Fit the door for 200 euros.", lines: [line("Fit the door", "Carpentry")], questions: [/euros/iu] },
  { id: "17-html", words: "Paint the walls for £200 and fit the door marked <img src=x onerror=alert(1)> for £60.", lines: [
    line("Paint the walls", "Decorating", "200.00"), line("fit the door marked <img src=x onerror=alert(1)>", "Carpentry", "60.00")], questions: [] },
  { id: "18-thirty-items", words: "", lines: [], questions: [] },
  { id: "19-trade-slang", words: "In the lounge. Skim the walls for two hundred quid and box in the pipes for one hundred quid and fit the skirting for fifty quid.", lines: [
    line("Skim the walls", "Plastering", "200.00", "Lounge"), line("box in the pipes", "Carpentry", "100.00", "Lounge"), line("fit the skirting", "Carpentry", "50.00", "Lounge")], questions: [] },
  { id: "20-room-price", words: "In the bathroom. Tile the floor and fit the basin. £800 for the bathroom.", lines: [line("Tile the floor", "Tiling", "", "Bathroom"), line("fit the basin", "Plumbing", "", "Bathroom")],
    questions: [/800.*bathroom/iu], roomPrice: { room: "Bathroom", pence: 80000 } },
];
const panels = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mango november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu amber birch cedar dune".split(" ");
const long = cases.find(c => c.id === "18-thirty-items")!;
long.words = panels.map(name => `paint panel ${name} for ten pounds`).join(" and ");
long.lines = panels.map(name => line(`paint panel ${name}`, "Decorating", "10.00"));

// Populated from the single hosted attack run. Each assertion keeps its independent expected value.
// A fixed finding becoming green is an unexpected pass; a new mismatch still fails.
const findings: Record<string, string> = {
  "01-four-items/desktop/line-4-trade": "RT12-01",
  "01-four-items/mobile-360/line-4-trade": "RT12-01",
  "02-two-prices-open/desktop/line-3-trade": "RT12-02",
  "02-two-prices-open/mobile-360/line-3-trade": "RT12-02",
  "03-two-sixty/desktop/line-1-trade": "RT12-03",
  "03-two-sixty/mobile-360/line-1-trade": "RT12-03",
  "05-whole-job/desktop/line-3-trade": "RT12-04",
  "05-whole-job/mobile-360/line-3-trade": "RT12-04",
  "07-thousand/desktop/line-1-trade": "RT12-05",
  "07-thousand/mobile-360/line-1-trade": "RT12-05",
  "08-vat/desktop/line-1-trade": "RT12-06",
  "08-vat/mobile-360/line-1-trade": "RT12-06",
  "08-vat/desktop/line-1-price": "RT12-07",
  "08-vat/mobile-360/line-1-price": "RT12-07",
  "08-vat/desktop/room-total-Whole job": "RT12-08",
  "08-vat/mobile-360/room-total-Whole job": "RT12-08",
  "08-vat/desktop/running-total": "RT12-09",
  "08-vat/mobile-360/running-total": "RT12-09",
  "09-materials/desktop/line-1-price": "RT12-10",
  "09-materials/mobile-360/line-1-price": "RT12-10",
  "09-materials/desktop/question-1": "RT12-11",
  "09-materials/mobile-360/question-1": "RT12-11",
  "09-materials/desktop/room-total-Whole job": "RT12-12",
  "09-materials/mobile-360/room-total-Whole job": "RT12-12",
  "09-materials/desktop/running-total": "RT12-13",
  "09-materials/mobile-360/running-total": "RT12-13",
  "10-correction/desktop/line-count": "RT12-14",
  "10-correction/mobile-360/line-count": "RT12-14",
  "10-correction/desktop/line-1-trade": "RT12-15",
  "10-correction/mobile-360/line-1-trade": "RT12-15",
  "10-correction/desktop/line-1-price": "RT12-16",
  "10-correction/mobile-360/line-1-price": "RT12-16",
  "10-correction/desktop/question-1": "RT12-17",
  "10-correction/mobile-360/question-1": "RT12-17",
  "10-correction/desktop/room-total-Whole job": "RT12-18",
  "10-correction/mobile-360/room-total-Whole job": "RT12-18",
  "10-correction/desktop/running-total": "RT12-19",
  "10-correction/mobile-360/running-total": "RT12-19",
  "11-room-return/desktop/line-count": "RT12-20",
  "11-room-return/mobile-360/line-count": "RT12-20",
  "11-room-return/desktop/line-2-trade": "RT12-21",
  "11-room-return/mobile-360/line-2-trade": "RT12-21",
  "11-room-return/desktop/line-3-trade": "RT12-22",
  "11-room-return/mobile-360/line-3-trade": "RT12-22",
  "11-room-return/desktop/room-total-Kitchen": "RT12-23",
  "11-room-return/mobile-360/room-total-Kitchen": "RT12-23",
  "11-room-return/desktop/running-total": "RT12-24",
  "11-room-return/mobile-360/running-total": "RT12-24",
  "12-bedroom-two/desktop/line-1-trade": "RT12-25",
  "12-bedroom-two/mobile-360/line-1-trade": "RT12-25",
  "12-bedroom-two/desktop/line-1-quantity": "RT12-26",
  "12-bedroom-two/mobile-360/line-1-quantity": "RT12-26",
  "12-bedroom-two/desktop/line-1-unit": "RT12-27",
  "12-bedroom-two/mobile-360/line-1-unit": "RT12-27",
  "12-bedroom-two/desktop/line-1-price": "RT12-28",
  "12-bedroom-two/mobile-360/line-1-price": "RT12-28",
  "12-bedroom-two/desktop/unexpected-questions": "RT12-29",
  "12-bedroom-two/mobile-360/unexpected-questions": "RT12-29",
  "12-bedroom-two/desktop/room-total-Bedroom 2": "RT12-30",
  "12-bedroom-two/mobile-360/room-total-Bedroom 2": "RT12-30",
  "12-bedroom-two/desktop/running-total": "RT12-31",
  "12-bedroom-two/mobile-360/running-total": "RT12-31",
  "14-range/desktop/line-1-trade": "RT12-32",
  "14-range/mobile-360/line-1-trade": "RT12-32",
  "15-total-mismatch/desktop/line-1-trade": "RT12-33",
  "15-total-mismatch/mobile-360/line-1-trade": "RT12-33",
  "15-total-mismatch/desktop/question-2": "RT12-34",
  "15-total-mismatch/mobile-360/question-2": "RT12-34",
  "16-euro/desktop/line-1-quantity": "RT12-35",
  "16-euro/mobile-360/line-1-quantity": "RT12-35",
  "16-euro/desktop/line-1-unit": "RT12-36",
  "16-euro/mobile-360/line-1-unit": "RT12-36",
  "16-euro/desktop/question-1": "RT12-37",
  "16-euro/mobile-360/question-1": "RT12-37",
  "16-euro/desktop/unexpected-questions": "RT12-38",
  "16-euro/mobile-360/unexpected-questions": "RT12-38",
  "17-html/desktop/line-1-trade": "RT12-39",
  "17-html/mobile-360/line-1-trade": "RT12-39",
  "18-thirty-items/desktop/line-1-trade": "RT12-40",
  "18-thirty-items/mobile-360/line-1-trade": "RT12-40",
  "18-thirty-items/desktop/line-2-trade": "RT12-41",
  "18-thirty-items/mobile-360/line-2-trade": "RT12-41",
  "18-thirty-items/desktop/line-3-trade": "RT12-42",
  "18-thirty-items/mobile-360/line-3-trade": "RT12-42",
  "18-thirty-items/desktop/line-4-trade": "RT12-43",
  "18-thirty-items/mobile-360/line-4-trade": "RT12-43",
  "18-thirty-items/desktop/line-5-trade": "RT12-44",
  "18-thirty-items/mobile-360/line-5-trade": "RT12-44",
  "18-thirty-items/desktop/line-6-trade": "RT12-45",
  "18-thirty-items/mobile-360/line-6-trade": "RT12-45",
  "18-thirty-items/desktop/line-7-trade": "RT12-46",
  "18-thirty-items/mobile-360/line-7-trade": "RT12-46",
  "18-thirty-items/desktop/line-8-trade": "RT12-47",
  "18-thirty-items/mobile-360/line-8-trade": "RT12-47",
  "18-thirty-items/desktop/line-9-trade": "RT12-48",
  "18-thirty-items/mobile-360/line-9-trade": "RT12-48",
  "18-thirty-items/desktop/line-10-trade": "RT12-49",
  "18-thirty-items/mobile-360/line-10-trade": "RT12-49",
  "18-thirty-items/desktop/line-11-trade": "RT12-50",
  "18-thirty-items/mobile-360/line-11-trade": "RT12-50",
  "18-thirty-items/desktop/line-12-trade": "RT12-51",
  "18-thirty-items/mobile-360/line-12-trade": "RT12-51",
  "18-thirty-items/desktop/line-13-trade": "RT12-52",
  "18-thirty-items/mobile-360/line-13-trade": "RT12-52",
  "18-thirty-items/desktop/line-14-trade": "RT12-53",
  "18-thirty-items/mobile-360/line-14-trade": "RT12-53",
  "18-thirty-items/desktop/line-15-trade": "RT12-54",
  "18-thirty-items/mobile-360/line-15-trade": "RT12-54",
  "18-thirty-items/desktop/line-16-trade": "RT12-55",
  "18-thirty-items/mobile-360/line-16-trade": "RT12-55",
  "18-thirty-items/desktop/line-17-trade": "RT12-56",
  "18-thirty-items/mobile-360/line-17-trade": "RT12-56",
  "18-thirty-items/desktop/line-18-trade": "RT12-57",
  "18-thirty-items/mobile-360/line-18-trade": "RT12-57",
  "18-thirty-items/desktop/line-19-trade": "RT12-58",
  "18-thirty-items/mobile-360/line-19-trade": "RT12-58",
  "18-thirty-items/desktop/line-20-trade": "RT12-59",
  "18-thirty-items/mobile-360/line-20-trade": "RT12-59",
  "18-thirty-items/desktop/line-21-trade": "RT12-60",
  "18-thirty-items/mobile-360/line-21-trade": "RT12-60",
  "18-thirty-items/desktop/line-22-trade": "RT12-61",
  "18-thirty-items/mobile-360/line-22-trade": "RT12-61",
  "18-thirty-items/desktop/line-23-trade": "RT12-62",
  "18-thirty-items/mobile-360/line-23-trade": "RT12-62",
  "18-thirty-items/desktop/line-24-trade": "RT12-63",
  "18-thirty-items/mobile-360/line-24-trade": "RT12-63",
  "18-thirty-items/desktop/line-25-trade": "RT12-64",
  "18-thirty-items/mobile-360/line-25-trade": "RT12-64",
  "18-thirty-items/desktop/line-26-trade": "RT12-65",
  "18-thirty-items/mobile-360/line-26-trade": "RT12-65",
  "18-thirty-items/desktop/line-27-trade": "RT12-66",
  "18-thirty-items/mobile-360/line-27-trade": "RT12-66",
  "18-thirty-items/desktop/line-28-trade": "RT12-67",
  "18-thirty-items/mobile-360/line-28-trade": "RT12-67",
  "18-thirty-items/desktop/line-29-trade": "RT12-68",
  "18-thirty-items/mobile-360/line-29-trade": "RT12-68",
  "18-thirty-items/desktop/line-30-trade": "RT12-69",
  "18-thirty-items/mobile-360/line-30-trade": "RT12-69",
  "19-trade-slang/desktop/line-count": "RT12-70",
  "19-trade-slang/mobile-360/line-count": "RT12-70",
  "19-trade-slang/desktop/line-1-price": "RT12-71",
  "19-trade-slang/mobile-360/line-1-price": "RT12-71",
  "19-trade-slang/desktop/line-2-separate": "RT12-72",
  "19-trade-slang/mobile-360/line-2-separate": "RT12-72",
  "19-trade-slang/desktop/line-2-trade": "RT12-73",
  "19-trade-slang/mobile-360/line-2-trade": "RT12-73",
  "19-trade-slang/desktop/line-2-price": "RT12-74",
  "19-trade-slang/mobile-360/line-2-price": "RT12-74",
  "19-trade-slang/desktop/unexpected-questions": "RT12-75",
  "19-trade-slang/mobile-360/unexpected-questions": "RT12-75",
  "19-trade-slang/desktop/room-total-Lounge": "RT12-76",
  "19-trade-slang/mobile-360/room-total-Lounge": "RT12-76",
  "19-trade-slang/desktop/running-total": "RT12-77",
  "19-trade-slang/mobile-360/running-total": "RT12-77",
  "20-room-price/desktop/line-count": "RT12-78",
  "20-room-price/mobile-360/line-count": "RT12-78",
  "20-room-price/desktop/line-1-trade": "RT12-79",
  "20-room-price/mobile-360/line-1-trade": "RT12-79",
  "20-room-price/desktop/question-1": "RT12-80",
  "20-room-price/mobile-360/question-1": "RT12-80",
  "20-room-price/desktop/room-total-Bathroom": "RT12-81",
  "20-room-price/mobile-360/room-total-Bathroom": "RT12-81",
  "20-room-price/desktop/running-total": "RT12-82",
  "20-room-price/mobile-360/running-total": "RT12-82",
  "20-room-price/desktop/said-room-price": "RT12-83",
  "20-room-price/mobile-360/said-room-price": "RT12-83"
};
// Round 1: all 20 scripts reproduced these checks at each size in the single hosted batch.
for (const quote of cases) for (const viewport of ["mobile-360", "desktop"]) {
  findings[`${quote.id}/${viewport}/tap-targets`] = viewport === "mobile-360" ? "RT12-84" : "RT12-85";
  findings[`${quote.id}/${viewport}/reopen-job`] = "RT12-86";
}
type Mismatch = { key: string; expected: unknown; actual: unknown; severity: "P0" | "P1" | "P2" };
const gbp = (pence: number) => `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function total(lines: Line[]) {
  const open = lines.filter(l => !l.price).length;
  // Test oracle: these scripted cases have integer counts and exact two-decimal rates.
  const pence = lines.reduce((sum, l) => sum + (l.price ? Number(l.price.replace(".", "")) * Number(l.quantity) : 0), 0);
  return { pence, suffix: open ? ` · incomplete: ${open} ${open === 1 ? "row needs" : "rows need"} a price` : " · complete" };
}
async function rows(page: Page): Promise<Line[]> {
  return page.locator(".review-line").evaluateAll(articles => articles.map(article => {
    const value = (prefix: string) => (article.querySelector(`[aria-label^="${prefix} "]`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "<missing>";
    return { description: value("Description"), room: article.closest(".room-group")?.getAttribute("aria-label") ?? "<missing>", trade: value("Trade"),
      quantity: value("Quantity"), unit: value("Unit"), price: value("Price") };
  }));
}
async function layout(page: Page) {
  return page.locator(".review").filter({ has: page.getByRole("heading", { name: "Check the work items", exact: true }) }).evaluate(section => {
    const targets = Array.from(section.querySelectorAll("button, input, select, textarea, summary, a[href]"));
    return { scroll: document.documentElement.scrollWidth > window.innerWidth, small: targets.flatMap(element => {
      const box = element.getBoundingClientRect();
      if (!element.getClientRects().length || !box.width || !box.height || getComputedStyle(element).visibility === "hidden") return [];
      return box.width < 44 || box.height < 44 ? [{ label: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
        width: Math.round(box.width * 100) / 100, height: Math.round(box.height * 100) / 100 }] : [];
    }) };
  });
}

test.describe("RT-12 typed quotes on the hosted preview", () => {
  test.skip(!process.env.JOBGUARD_HOSTED_URL, "Hosted only: use playwright.hosted.config.ts and JOBGUARD_HOSTED_URL");
  test.setTimeout(120_000);
  for (const mode of ["line-content", "layout-save"] as const) for (const quote of cases) test(`${quote.id} @${mode}`, async ({ page }, info) => {
    const layoutSaveOnly = mode === "layout-save";
    expect(new URL(info.project.use.baseURL!).origin).toBe(ORIGIN);
    page.setDefaultTimeout(20_000);
    await page.setViewportSize({ width: info.project.name === "mobile-360" ? 360 : 1280, height: 740 });
    const mismatches: Mismatch[] = [];
    const known: Mismatch[] = [];
    const checks: { key: string; pass: boolean }[] = [];
    const check = (key: string, expected: unknown, actual: unknown, severity: Mismatch["severity"] = "P1", suppress = false) => {
      checks.push({ key, pass: JSON.stringify(expected) === JSON.stringify(actual) });
      if (JSON.stringify(expected) !== JSON.stringify(actual)) (suppress ? known : mismatches).push({ key, expected, actual, severity });
    };
    const dialogs: string[] = [];
    page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    const crashes: string[] = [];
    const harnessErrors: string[] = [];
    page.on("pageerror", error => crashes.push(error.message));
    let capture: { jobId: string; source: { text: string }; [key: string]: unknown } | undefined;
    let saved = false;
    let actualRows: Line[] = [];
    let questions: string[] = [];
    const entry = await page.goto("/jobs/new");
    const html = await entry!.text();
    const assets = [...html.matchAll(/<script[^>]+src="([^"]+)"/gu)].map(match => match[1]!).sort();
    const assetHash = createHash("sha256").update(assets.join("\n")).digest("hex");
    test.skip(assetHash !== ENTRY_ASSET_SHA256, `Preview deployment changed: ${ENTRY_ASSET_SHA256} -> ${assetHash}; stop and obtain the new head from the owner.`);
    try {
      await page.getByRole("button", { name: "Start my own practice firm", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Walk the job", exact: true })).toBeVisible();
      const session = await (await page.request.get("/api/session")).json() as { blankCompany: boolean; tenants: { id: string }[] };
      check("own-practice-firm", true, session.blankCompany, "P0");
      await page.getByLabel("Work details").fill(quote.words);
      const captured = page.waitForResponse(r => new URL(r.url()).pathname === "/api/jobs/capture" && r.request().method() === "POST");
      await page.getByRole("button", { name: "Make my draft", exact: true }).click();
      const response = await captured;
      expect(response.ok(), `capture HTTP ${response.status()}`).toBe(true);
      capture = await response.json() as typeof capture;
      check("capture-transcript", quote.words, capture!.source.text);
      await page.getByRole("button", { name: "Check and edit my draft", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
      check("right-job", capture!.jobId, new URL(page.url()).pathname.split("/")[2], "P0");
      actualRows = await rows(page);
      if (!layoutSaveOnly) {
        // F-005 is exercised and captured as evidence, but never reported again as an RT12 finding.
        const supplySplit = quote.known === "F-005" && actualRows.length === 2;
        check("line-count", quote.lines.length, actualRows.length, "P1", supplySplit);
        const claimed = new Set<number>();
        const expectedLines = quote.lines.map(l => ({ ...l }));
        for (const [index, expected] of quote.lines.entries()) {
          // The screen groups by room; returning to the first room can change DOM order legitimately.
          const matches = actualRows.map((actual, position) => ({ actual, position })).filter(({ actual }) => actual.description.toLowerCase().includes(expected.description.toLowerCase()));
          check(`line-${index + 1}-description`, 1, matches.length, "P1", supplySplit);
          const match = matches[0];
          if (!match) continue;
          check(`line-${index + 1}-separate`, false, claimed.has(match.position), "P1", supplySplit);
          claimed.add(match.position);
          const actual = match.actual;
          for (const field of ["room", "trade", "quantity", "unit", "price"] as const) {
            const alternatives = field === "price" ? quote.alternativePrices?.[index] : undefined;
            if (alternatives?.includes(actual.price)) expectedLines[index]!.price = actual.price;
            check(`line-${index + 1}-${field}`,
              alternatives ?? (field === "room" ? canonicalRoom(expected[field]) : expected[field]),
              alternatives?.includes(actual.price) ? alternatives : (field === "room" ? canonicalRoom(actual[field]) : actual[field]),
              field === "price" ? (actual.price ? "P0" : "P1") : ((field === "quantity" || field === "unit") && !actual[field] ? "P2" : "P1"), supplySplit);
          }
        }
        questions = await page.locator(".questions > div > p").allTextContents();
        for (const [index, needed] of quote.questions.entries()) check(`question-${index + 1}`, needed.source, questions.some(q => needed.test(q)) ? needed.source : questions, "P2");
        const unexpected = questions.filter(q => !/disposal and waste allowance/iu.test(q) && !quote.questions.some(pattern => pattern.test(q)));
        check("unexpected-questions", [], unexpected, "P2", supplySplit);
        for (const room of [...new Set(quote.lines.map(l => l.room))]) {
          const expected = total(expectedLines.filter(l => l.room === room));
          const actualRoom = actualRows.find(row => canonicalRoom(row.room) === canonicalRoom(room))?.room ?? room;
          const group = page.getByTestId("room-group").filter({ has: page.getByRole("heading", { name: actualRoom, exact: true }) });
          const label = `${gbp(expected.pence)}${expected.suffix === " · complete" ? "" : expected.suffix}`;
          check(`room-total-${room}`, label, (await group.getByTestId("room-total").allTextContents())[0] ?? null, "P0", supplySplit);
        }
        const expectedTotal = total(expectedLines);
        check("running-total", `Total so far ${gbp(expectedTotal.pence)}${expectedTotal.suffix}`, (await page.getByTestId("running-total").textContent())?.trim(), "P0", supplySplit);
        const whole = await page.getByTestId("whole-job").allTextContents();
        check("whole-job", quote.whole?.words.source ?? null, quote.whole ? (whole.some(text => quote.whole!.words.test(text)) ? quote.whole.words.source : whole) : (whole.length ? whole : null), "P2");
        if (quote.whole) check("whole-job-rows", `Rows add up to ${gbp(expectedTotal.pence)}${expectedTotal.suffix === " · complete" ? "" : " so far"}`, (await page.getByTestId("rows-add-up").allTextContents())[0] ?? null, "P2");
        if (quote.roomPrice) {
          const group = page.getByRole("region", { name: quote.roomPrice.room, exact: true });
          if (await group.count()) {
            await group.getByLabel("One price for the room", { exact: true }).check();
            check("said-room-price", true, await group.getByRole("button", { name: new RegExp(`Use the ${gbp(quote.roomPrice.pence).replace(".", "\\.")}`) }).count() > 0, "P2");
            await group.getByLabel("Itemised", { exact: true }).check();
          } else check("said-room-price", quote.roomPrice, null, "P1");
        }
      }
      try {
        const dimensions = await layout(page);
        check("horizontal-scroll", false, dimensions.scroll, "P2");
        check("tap-targets", [], dimensions.small, "P2");
      } catch (error) {
        harnessErrors.push(`RT12 harness could not measure layout: ${String(error)}`);
      }
      check("html-elements", 0, await page.locator(".review img[onerror], .review script").count(), "P0");
      check("html-dialogs", [], dialogs, "P0");
      await page.screenshot({ path: info.outputPath("review.png"), fullPage: true });
      // Edit even when extraction mismatches: a bad draft must not hide a lost-save defect.
      const firstPrice = page.locator(".review-line").first().getByRole("textbox", { name: /^Price /u });
      await firstPrice.fill("123.45");
      const edited = await rows(page);
      const reviewURL = page.url();
      const saveResponse = page.waitForResponse(r => new URL(r.url()).pathname === `/api/jobs/${capture!.jobId}/review` && r.request().method() === "POST");
      await page.getByRole("button", { name: "Save review", exact: true }).click();
      const result = await saveResponse;
      check("save-status", true, result.ok());
      await expect(page.getByText("Review saved. Your source and choices will be here after reload.", { exact: true })).toBeVisible();
      saved = true;
      await page.reload();
      await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
      check("reload-edit", edited, await rows(page));
      check("reload-transcript", quote.words, await page.locator(".source pre").first().textContent());
      await page.goto("/jobs");
      await expect(page.getByRole("button", { name: "Open job →", exact: true })).toHaveCount(1);
      await page.getByRole("button", { name: "Open job →", exact: true }).click();
      // RT12-86: this immediate sample races router.push. It does not prove wrong-job navigation.
      // Retained as an expected failing harness observation; the one-run round cannot verify a timing repair.
      check("reopen-job", true, new URL(page.url()).pathname.includes(capture!.jobId), "P2");
      await page.goto(reviewURL); // Reopen the saved review after the ordinary Jobs entry.
      await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
      check("reopen-edit", edited, await rows(page));
      check("reopen-transcript", quote.words, await page.locator(".source pre").first().textContent());
      const reopenedSession = await (await page.request.get("/api/session")).json() as typeof session;
      check("reopen-firm", session.tenants.map(t => t.id), reopenedSession.tenants.map(t => t.id), "P0");
      await page.screenshot({ path: info.outputPath("reopened.png"), fullPage: true });
    } catch (error) {
      if (/strict mode violation|RT12 harness/iu.test(String(error))) throw error;
      mismatches.push({ key: "journey", expected: "Review, edit, save, reload and reopen finish", actual: String(error), severity: "P1" });
      await page.screenshot({ path: info.outputPath("interrupted.png"), fullPage: true }).catch(() => undefined);
    }
    check("page-crashes", [], crashes);
    const evidence = { case: quote.id, viewport: info.project.name, mode, checks, head: HEAD_UNDER_TEST, worker: WORKER, transcript: quote.words, expected: quote, actualRows, questions, saved, known, mismatches, harnessErrors };
    await info.attach("RT12-evidence", { body: JSON.stringify(evidence, (_key, value) => value instanceof RegExp ? value.source : value, 2), contentType: "application/json" });
    expect(harnessErrors, "Test harness errors are not product findings").toEqual([]);
    // Assert new mismatches before marking the known ones as expected failures.
    const unknown = mismatches.filter(m => !findings[`${quote.id}/${info.project.name}/${m.key}`]);
    expect(unknown, `Unregistered mismatch: ${JSON.stringify(unknown)}`).toEqual([]);
    const registered = Object.entries(findings).filter(([key]) => key.startsWith(`${quote.id}/${info.project.name}/`) && (!layoutSaveOnly || checks.some(check => key === `${quote.id}/${info.project.name}/${check.key}`))).map(([, id]) => id);
    const ids = [...new Set([...registered, ...(known.length && quote.known ? [quote.known] : [])])];
    test.fail(ids.length > 0, ids.join(", "));
    expect([...mismatches, ...known], JSON.stringify({ mismatches, known })).toEqual([]);
  });
});
