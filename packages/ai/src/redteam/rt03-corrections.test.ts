import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCaptureFixture } from "../capture-fixture-parser.js";
import { checkSpokenNumbers, readSpokenJob } from "../context-reader.js";

type Focus = {
  id: string; transcript: string; kind: "room" | "count" | "withdraw" | "repeat" | "restart" | "item";
  subject: string; replacement?: string; price: number; count?: string;
  expected: string; status: "pass" | "open-finding"; finding?: string;
};

// These alternatives cannot be expressed by the shared corpus schema: removal OR a
// targeted question, a corrected room OR a question, one repeated item OR a duplicate warning.
const cases: Focus[] = [
  { id: "RT-03-301", transcript: "Paint the hall, sorry the landing, for £210", kind: "room", subject: "Paint", replacement: "Landing", price: 21000, expected: "One painting item in Landing, or a question explicitly asking about landing", status: "open-finding", finding: "RT-03-F054" },
  { id: "RT-03-302", transcript: "Fit the kitchen shelves £180. I meant the utility", kind: "room", subject: "shelves", replacement: "Utility", price: 18000, expected: "Shelves in Utility, or an explicit utility question", status: "open-finding", finding: "RT-03-F055" },
  { id: "RT-03-303", transcript: "Tile the bathroom, no the shower room, £390", kind: "room", subject: "Tile", replacement: "Shower room", price: 39000, expected: "Tiling in Shower room, or an explicit shower room question", status: "open-finding", finding: "RT-03-F056" },
  { id: "RT-03-304", transcript: "Decorate the bedroom two £280, actually bedroom three", kind: "room", subject: "Decorate", replacement: "Bedroom three", price: 28000, expected: "Decorating in Bedroom three, or an explicit bedroom three question", status: "pass" },
  { id: "RT-03-305", transcript: "Paint the lounge £450. Change the room to the dining room", kind: "room", subject: "Paint", replacement: "Dining room", price: 45000, expected: "Painting in Dining room, or an explicit dining room question", status: "open-finding", finding: "RT-03-F057" },
  { id: "RT-03-306", transcript: "Tile the utility £310, sorry, the kitchen instead", kind: "room", subject: "Tile", replacement: "Kitchen", price: 31000, expected: "Tiling in Kitchen, or an explicit kitchen question", status: "pass" },
  { id: "RT-03-307", transcript: "Hang 3 gates at £60 each, no, 4 gates", kind: "count", subject: "Hang", replacement: "4 gates", count: "4", price: 6000, expected: "One gate item; count 4 or null with a correction question; only the said £60 rate may be kept", status: "open-finding", finding: "RT-03-F058" },
  { id: "RT-03-308", transcript: "Fit five shelves at £25 each. Sorry, I meant seven shelves", kind: "count", subject: "Fit", replacement: "seven shelves", count: "7", price: 2500, expected: "One shelf item; count 7 or null with a correction question; no old count 5 or calculated total", status: "open-finding", finding: "RT-03-F059" },
  { id: "RT-03-309", transcript: "Install 6 sockets at £30 each, actually 8 sockets", kind: "count", subject: "Install", replacement: "8 sockets", count: "8", price: 3000, expected: "One socket item; count 8 or null with a correction question; no old count 6 or calculated total", status: "open-finding", finding: "RT-03-F060" },
  { id: "RT-03-310", transcript: "Lay 18 square metres at £20 per square metre, wait, 16 square metres", kind: "count", subject: "Lay", replacement: "16 square metres", count: "16", price: 2000, expected: "One flooring item; measure 16 or null with a correction question; no old measure 18 or calculated total", status: "open-finding", finding: "RT-03-F061" },
  { id: "RT-03-311", transcript: "Paint the hall £210. Fit the architraves £160. Forget the architraves", kind: "withdraw", subject: "architraves", price: 16000, expected: "Architraves removed or explicitly flagged as withdrawn; hall price £210 preserved", status: "open-finding", finding: "RT-03-F062" },
  { id: "RT-03-312", transcript: "Skim the ceiling £350. Do not bother with the ceiling", kind: "withdraw", subject: "ceiling", price: 35000, expected: "Ceiling removed or explicitly questioned; never silently retain its £350 charge", status: "open-finding", finding: "RT-03-F063" },
  { id: "RT-03-313", transcript: "Paint the lounge £420. Leave the lounge out", kind: "withdraw", subject: "lounge", price: 42000, expected: "Lounge removed or explicitly questioned; never silently retain its £420 charge", status: "open-finding", finding: "RT-03-F064" },
  { id: "RT-03-314", transcript: "Fit the handrail £185, cancel the handrail", kind: "withdraw", subject: "handrail", price: 18500, expected: "Handrail removed or explicitly questioned; never silently retain its £185 charge", status: "open-finding", finding: "RT-03-F065" },
  { id: "RT-03-315", transcript: "Tile the splashback £295. Scratch the splashback from the quote", kind: "withdraw", subject: "splashback", price: 29500, expected: "Splashback removed or explicitly questioned; never silently retain its £295 charge", status: "open-finding", finding: "RT-03-F066" },
  { id: "RT-03-316", transcript: "Replace the basin £240. Fit the mirror £75. We are not doing the basin", kind: "withdraw", subject: "basin", price: 24000, expected: "Basin removed or explicitly flagged as withdrawn; mirror price £75 preserved", status: "open-finding", finding: "RT-03-F067" },
  { id: "RT-03-317", transcript: "Paint the fence £280. Yeah, paint the fence £280", kind: "repeat", subject: "fence", price: 28000, expected: "One fence item, or multiple items with an explicit duplicate question", status: "open-finding", finding: "RT-03-F068" },
  { id: "RT-03-318", transcript: "Fit the gate £190. Fit the gate £190. Fit the gate £190", kind: "repeat", subject: "gate", price: 19000, expected: "One gate item, or multiple items with an explicit duplicate question", status: "open-finding", finding: "RT-03-F069" },
  { id: "RT-03-319", transcript: "Lay the carpet £340; lay the carpet £340", kind: "repeat", subject: "carpet", price: 34000, expected: "One carpet item, or multiple items with an explicit duplicate question", status: "open-finding", finding: "RT-03-F070" },
  { id: "RT-03-320", transcript: "Install the radiator £220\nInstall the radiator £220", kind: "repeat", subject: "radiator", price: 22000, expected: "One radiator item, or multiple items with an explicit duplicate question", status: "open-finding", finding: "RT-03-F071" },
  { id: "RT-03-321", transcript: "Fit the, fit the latch £85", kind: "restart", subject: "latch", price: 8500, expected: "One latch line priced exactly £85; the unfinished verb is not extra work", status: "open-finding", finding: "RT-03-F072" },
  { id: "RT-03-322", transcript: "Paint, paint the gate £160", kind: "restart", subject: "gate", price: 16000, expected: "One gate line priced exactly £160; the restarted verb is not extra work", status: "open-finding", finding: "RT-03-F073" },
  { id: "RT-03-323", transcript: "Supply and, supply and fit the basin £280", kind: "restart", subject: "basin", price: 28000, expected: "One basin line priced exactly £280; the incomplete supply clause is not extra work", status: "open-finding", finding: "RT-03-F074" },
  { id: "RT-03-324", transcript: "Hang the new, hang the new door £140", kind: "restart", subject: "door", price: 14000, expected: "One door line priced exactly £140; the unfinished description is not extra work", status: "open-finding", finding: "RT-03-F075" },
  { id: "RT-03-325", transcript: "Fit the sink, sorry the basin, for £230", kind: "item", subject: "sink", replacement: "basin", price: 23000, expected: "One basin item or an explicit sink/basin correction question; never two priced items", status: "open-finding", finding: "RT-03-F076" },
  { id: "RT-03-326", transcript: "Paint the wall £330. I mean skim the wall for £330", kind: "item", subject: "Paint", replacement: "skim", price: 33000, expected: "One plastering item or an explicit paint/skim correction question; never two priced items", status: "open-finding", finding: "RT-03-F077" },
  { id: "RT-03-327", transcript: "Fit the laminate, no, lay the vinyl for £370", kind: "item", subject: "laminate", replacement: "vinyl", price: 37000, expected: "One vinyl item or an explicit laminate/vinyl correction question; never two priced items", status: "open-finding", finding: "RT-03-F078" },
  { id: "RT-03-328", transcript: "Install the socket £65, sorry, replace the switch for £65", kind: "item", subject: "socket", replacement: "switch", price: 6500, expected: "One switch item or an explicit socket/switch correction question; never two priced items", status: "open-finding", finding: "RT-03-F079" },
];

type View = {
  lines: { description: string; price: number | null; quantity: string | null; room: string | null }[];
  questions: string[];
};
const sourceId = "00000000-0000-4000-8000-000000000001";
const lower = (text: string) => text.toLowerCase();
function views(transcript: string): [string, View][] {
  const capture = parseCaptureFixture(sourceId, transcript);
  const { timeline: _timeline, ...reader } = readSpokenJob(sourceId, transcript);
  const checked = checkSpokenNumbers(reader, transcript);
  return [["capture", capture], ["reader", reader], ["checked reader", checked]].map(([path, value]) => {
    const output = value as typeof capture | typeof reader;
    return [path as string, {
      lines: output.lines.map(line => ({ description: line.description.value, price: line.unitPricePence.value,
        quantity: line.quantity.value, room: "areas" in output && "areaKey" in line
          ? output.areas.find(area => area.key === line.areaKey)?.name.value ?? null : null })),
      questions: output.questions.map(question => "text" in question ? question.text : question.question.value),
    }];
  });
}

function semanticFailures(item: Focus, view: View, path: string): string[] {
  const failures: string[] = [];
  const matching = view.lines.filter(line => lower(line.description).includes(lower(item.subject)));
  const asks = (words: string) => view.questions.some(question => lower(question).includes(lower(words)));
  const relevantQuestion = asks(item.replacement ?? item.subject);
  const withdrawalQuestion = view.questions.some(question => lower(question).includes(lower(item.subject))
    && /cancel|forget|leave.*out|not doing|do not|don.t|scratch|withdraw|still|omit|remove|bother/iu.test(question));
  if (item.kind === "room" && path !== "capture") {
    if (!matching.length || !matching.every(line => lower(line.room ?? "") === lower(item.replacement!)) && !relevantQuestion)
      failures.push(`S3: corrected room ${item.replacement} neither used nor questioned`);
  }
  if (item.kind === "count") {
    if (view.lines.length !== 1 || !matching.length) failures.push("S2: corrected count became extra work or lost its item");
    if (matching.some(line => line.quantity !== item.count && !(line.quantity === null && relevantQuestion)))
      failures.push(`S3: count is neither ${item.count} nor open with a correction question`);
  }
  if (item.kind === "withdraw" && matching.length && !withdrawalQuestion)
    failures.push(matching.some(line => line.price !== null) ? "M5: withdrawn item silently retains fixed money" : "S1: withdrawal neither applied nor questioned");
  if (item.kind === "repeat") {
    if (!matching.length) failures.push("S1: repeated item lost");
    if (matching.length > 1 && !view.questions.some(question => /duplicat|repeat|twice|same (?:item|work|line)/iu.test(question)))
      failures.push("S2: repeated item silently doubled");
  }
  if (item.kind === "restart" && (view.lines.length !== 1 || matching.length !== 1 || matching[0]!.price !== item.price))
    failures.push("S1/S2: unfinished restart became extra work or lost the exact price");
  if (item.kind === "item") {
    const replaced = view.lines.filter(line => lower(line.description).includes(lower(item.replacement!)));
    if (!(view.lines.length === 1 && replaced.length === 1 && !matching.length) && !relevantQuestion)
      failures.push("S3: replacement item/trade neither applied nor questioned");
    if (view.lines.filter(line => line.price !== null).length > 1) failures.push("S2: replacement billed as two items");
  }
  if (view.lines.some(line => line.price !== null && line.price !== item.price
    // Withdrawal fixtures contain explicitly priced, unrelated work that must survive.
    && !(item.id === "RT-03-311" && /hall/iu.test(line.description) && line.price === 21000)
    && !(item.id === "RT-03-316" && /mirror/iu.test(line.description) && line.price === 7500)))
    failures.push("M1: kept money not said for this item");
  if (item.id === "RT-03-311" && !view.lines.some(line => /hall/iu.test(line.description) && line.price === 21000))
    failures.push("S1: unrelated hall price lost");
  if (item.id === "RT-03-316" && !view.lines.some(line => /mirror/iu.test(line.description) && line.price === 7500))
    failures.push("S1: unrelated mirror price lost");
  return failures;
}

function run(item: Focus) {
  try { return views(item.transcript).flatMap(([path, view]) => semanticFailures(item, view, path).map(failure => `${path}: ${failure}`)); }
  catch (error) { return [`Reader crashed: ${String(error)}`]; }
}

describe("RT-03 semantic correction alternatives", () => {
  for (const item of cases) it(`${item.id} [${item.status}] ${item.kind}`, () => {
    const failures = run(item);
    if (item.status === "open-finding") {
      expect(item.finding).toMatch(/^RT-03-F\d{3}$/u);
      expect(failures, `${item.id} now passes; close ${item.finding}`).not.toEqual([]);
    } else expect(failures, item.expected).toEqual([]);
  });
  it("keeps new cases distinct from the seed and the shared corpus", () => {
    const corpus = ["RT-03-corrections-seed.v1.json", "RT-03-corrections.v1.json"].flatMap(file =>
      JSON.parse(readFileSync(new URL(`./corpus/${file}`, import.meta.url), "utf8")) as { id: string; transcript: string; status: string; finding?: string }[]);
    const all = [...corpus, ...cases];
    expect(new Set(all.map(item => item.id)).size).toBe(all.length);
    expect(new Set(all.map(item => item.transcript)).size).toBe(all.length);
    expect(corpus.filter(item => Number(item.id.slice(-3)) >= 101).length).toBeGreaterThanOrEqual(100);
    const findings = readFileSync(new URL("../../../../docs/testing/spoken-quote-hardening/FINDINGS.md", import.meta.url), "utf8");
    for (const item of all.filter(item => item.status === "open-finding")) {
      const rows = findings.split("\n").filter(row => row.startsWith(`| ${item.finding} | RT-03 |`));
      expect(rows, `${item.id} needs exactly one finding at the tested base`).toHaveLength(1);
      const countCorrection = Number(item.id.slice(-3)) >= 169 && Number(item.id.slice(-3)) <= 180;
      const head = countCorrection ? "3d43d1d7" : "a44f5d35b363a5182b166ff724d2d09ca5c1060f";
      expect(rows[0]).toContain(`| ${head} | ${item.id} |`);
    }
  });
});

describe("RT-03 semantic oracle guards", () => {
  const withdrawal = cases.find(item => item.id === "RT-03-314")!;
  const kept: View = { lines: [{ description: "Fit the handrail", price: 18500, quantity: null, room: null }], questions: [] };
  it("accepts removal or an explicit withdrawal question", () => {
    expect(semanticFailures(withdrawal, { lines: [], questions: [] }, "reader")).toEqual([]);
    expect(semanticFailures(withdrawal, { ...kept, questions: ["Cancel the handrail?"] }, "reader")).toEqual([]);
    expect(semanticFailures(withdrawal, { ...kept, questions: ["Confirm handrail VAT"] }, "reader")).toContain("M5: withdrawn item silently retains fixed money");
  });
  it("accepts the corrected room or an explicit room question, never a generic check", () => {
    const item = cases[0]!;
    const line = { description: "Paint the hall", price: 21000, quantity: null, room: "Landing" };
    expect(semanticFailures(item, { lines: [line], questions: [] }, "reader")).toEqual([]);
    line.room = "Hall";
    expect(semanticFailures(item, { lines: [line], questions: ["Hall or landing?"] }, "reader")).toEqual([]);
    expect(semanticFailures(item, { lines: [line], questions: ["Check this line"] }, "reader")).not.toEqual([]);
  });
  it("accepts one repeated item or a duplicate question, never silent double pricing", () => {
    const item = cases.find(item => item.kind === "repeat")!;
    const line = { description: "Paint the fence", price: 28000, quantity: null, room: null };
    expect(semanticFailures(item, { lines: [line], questions: [] }, "reader")).toEqual([]);
    expect(semanticFailures(item, { lines: [line, line], questions: ["Is this a duplicate?"] }, "reader")).toEqual([]);
    expect(semanticFailures(item, { lines: [line, line], questions: ["Confirm VAT"] }, "reader")).toContain("S2: repeated item silently doubled");
  });
  it("rejects the withdrawn count even when a question exists", () => {
    const item = cases.find(item => item.kind === "count")!;
    const line: View["lines"][number] = { description: "Hang gates", price: 6000, quantity: "3", room: null };
    const view = { lines: [line], questions: ["Confirm 4 gates"] };
    expect(semanticFailures(item, view, "reader")).not.toEqual([]);
    line.quantity = null;
    expect(semanticFailures(item, view, "reader")).toEqual([]);
    line.quantity = "4";
    expect(semanticFailures(item, { ...view, questions: [] }, "reader")).toEqual([]);
  });
});
