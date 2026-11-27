import { test } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { readSpokenJob } from "./context-reader.js";
test("d", () => {
  const cases = JSON.parse(readFileSync("../../docs/fixtures/ai/spoken-quote-understanding/held-out.v1.json", "utf8")).cases;
  const out = cases.map((c: any) => { const r = readSpokenJob("s", c.text); const room = new Map(r.areas.map(a => [a.key, a.name.value]));
    return [c.id, ...r.lines.map(l => `${room.get(l.areaKey)} | ${l.trade.value} | ${l.description.value} | q=${l.quantity.value} ${l.unit.value} p=${l.unitPricePence.value} ${l.priceBasis}`), ...r.questions.map(q => `  Q[${q.lineIndex ?? q.areaKey ?? "-"}] ${q.text}`), `  AP ${JSON.stringify(r.areaPrices.map(a => [a.areaKey, a.pence]))} WJ ${r.wholeJobPrice?.pence}`].join("\n"); }).join("\n\n");
  writeFileSync("/tmp/claude-0/dbg.txt", out);
});
