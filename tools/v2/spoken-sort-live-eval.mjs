// V2-SQ-G scored run: the only path to the API besides the practice capture. Run by hand on Ben's Mac, never in CI:
//   pnpm --filter @jobguard/ai build && pnpm --filter @jobguard/db build
//   JOBGUARD_SPOKEN_JOB_EVAL=1 JOBGUARD_SPOKEN_JOB_MODEL_KEY=… JOBGUARD_SPOKEN_JOB_MONTHLY_CAP_PENCE=1000 \
//     JOBGUARD_PRACTICE_SESSION=<jg_session cookie of the signed-in practice builder> JOBGUARD_LOCAL_V2=1 JOBGUARD_ENV=synthetic_demo \
//     DATABASE_URL=<runtime url of jobguard_v2_local> pnpm --filter @jobguard/ai eval:spoken-sort-live -- <cases.json> [report.json]
// The ledger context comes from that practice session through the one practice bridge, as in the app; the script
// never builds a tenant context itself.
// It does not need the live flag. It writes to the ledger in the local jobguard_v2_local database and obeys the same
// cap and daily limit as the app. It prints case ids, scores and cost only: no transcript text, never the key.
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { V2AiCallLedger, authenticatePracticeSession } from "../../packages/db/dist/index.js";
import {
  FixtureAiProvider, LiveAiGateway, SPOKEN_SORT_MAX_INPUT_BYTES, SPOKEN_SORT_OPERATION, cleanTranscript, combineModelReading, microPenceFor,
  readSpokenJob, reservationMicroPence, safeToSend, sentBytes, sortItems, spokenSortCapPence,
} from "../../packages/ai/dist/index.js";
import { createAnthropicLiveSortAdapter } from "../../packages/ai/dist/anthropic-live-sort.js";
import { evaluateContextReader, formatContextReaderReport, loadContextReaderCases } from "../../packages/ai/dist/context-reader-evaluation.js";

const refuse = (code, why) => { process.stderr.write(`spoken-sort-live-eval: ${why}\n`); process.exit(code); };
if (process.env.CI) refuse(2, "refused: never runs in CI");
if (process.env.JOBGUARD_SPOKEN_JOB_EVAL !== "1") refuse(2, "refused: set JOBGUARD_SPOKEN_JOB_EVAL=1");
const capPence = spokenSortCapPence(process.env.JOBGUARD_SPOKEN_JOB_MONTHLY_CAP_PENCE);
if (capPence === null) refuse(2, "refused: JOBGUARD_SPOKEN_JOB_MONTHLY_CAP_PENCE must be 1 to 2000");
const [casesPath, reportPath] = process.argv.slice(2).filter(arg => arg !== "--");
if (!casesPath) refuse(2, "usage: eval:spoken-sort-live -- <cases.json> [report.json]");
if (!process.env.JOBGUARD_SPOKEN_JOB_MODEL_KEY) refuse(2, "refused: JOBGUARD_SPOKEN_JOB_MODEL_KEY is not set");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const { rows: [{ database }] } = await pool.query("SELECT current_database() AS database");
  if (database !== "jobguard_v2_local") refuse(2, "refused: the ledger must be the local jobguard_v2_local database");
  const { context } = await authenticatePracticeSession(pool, process.env.JOBGUARD_PRACTICE_SESSION)
    .catch(() => refuse(2, "refused: JOBGUARD_PRACTICE_SESSION must be a signed-in practice builder session"));
  const tenantId = context.tenantId;
  const adapter = createAnthropicLiveSortAdapter({ apiKey: process.env.JOBGUARD_SPOKEN_JOB_MODEL_KEY, environment: "synthetic_demo", tenantId, operation: SPOKEN_SORT_OPERATION });
  if (!adapter) refuse(2, "refused: JOBGUARD_SPOKEN_JOB_MODEL_KEY is not set");
  const ledger = new V2AiCallLedger(pool);
  if (!(await ledger.available(context))) refuse(2, "refused: migration 2069 is not applied");
  const gateway = new LiveAiGateway(new FixtureAiProvider({}), () => ({ tenantId }), adapter);
  const cases = loadContextReaderCases(casesPath);
  const outcomes = [];
  const combinedById = new Map();
  let settledMicroPence = 0, numberDifferences = 0;
  for (const item of cases) {
    const sourceId = `case-${item.id}`;
    const { timeline: _, ...readerA } = readSpokenJob(sourceId, item.text);
    if (new TextEncoder().encode(item.text).length > SPOKEN_SORT_MAX_INPUT_BYTES) { outcomes.push({ id: item.id, outcome: "too_long" }); continue; }
    const cleaned = cleanTranscript(item.text);
    const items = sortItems(readerA, item.text, cleaned);
    if (!safeToSend(cleaned, items)) { outcomes.push({ id: item.id, outcome: "party_kept" }); continue; }
    const callId = randomUUID(), captureId = randomUUID();
    const reserved = await ledger.reserve(context, { callId, captureId, microPence: reservationMicroPence(sentBytes(cleaned, items)), capMicroPence: capPence * 1_000_000 });
    if (!reserved.reserved) { outcomes.push({ id: item.id, outcome: reserved.reason }); break; }
    const result = await gateway.generateLive({ operation: SPOKEN_SORT_OPERATION, environment: "synthetic_demo", tenantId, cleaned, items });
    if (result.usage) {
      const microPence = microPenceFor(result.usage.inputTokens, result.usage.outputTokens);
      settledMicroPence += microPence;
      await ledger.settle(context, { callId, captureId, microPence, outcome: result.kind === "ok" ? "ok" : result.reason === "cap_reached" ? "unavailable" : result.reason,
        modelId: result.modelId, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens });
    }
    if (result.kind !== "ok") { outcomes.push({ id: item.id, outcome: result.reason }); continue; }
    const combined = combineModelReading(readerA, item.text, result.wire, sourceId);
    const numbers = u => JSON.stringify({ lines: u.lines.slice(0, readerA.lines.length).map(l => [l.quantity, l.unit, l.unitPricePence, l.priceBasis]), areaPrices: u.areaPrices, wholeJobPrice: u.wholeJobPrice });
    if (numbers(combined.understanding) !== numbers(readerA)) numberDifferences++;
    // A line the model reader added always carries its own question; count any that does not.
    const unasked = combined.understanding.lines.slice(readerA.lines.length).filter((_, at) => !combined.understanding.questions.some(q => q.lineIndex === readerA.lines.length + at)).length;
    combinedById.set(item.id, combined.understanding);
    outcomes.push({ id: item.id, outcome: combined.used ? "used" : combined.reason, keptMissed: combined.used ? combined.keptMissed : 0, unaskedAddedLines: unasked, modelId: result.modelId, usage: result.usage });
  }
  const readerAReport = evaluateContextReader(cases);
  const combinedReport = evaluateContextReader(cases, (sourceId, text, id) => combinedById.get(id) ?? (({ timeline: _, ...a }) => a)(readSpokenJob(sourceId, text)));
  // A clean run needs a model answer for every case: a failed call, a refused reservation or a skipped case is incomplete,
  // and its Reader A fallback must never pass as a live score.
  const modelAnswered = combinedById.size;
  const report = { schema: "jobguard-spoken-sort-live-eval/1", model: "claude-sonnet-5-5", cases: cases.length, modelAnswered, complete: modelAnswered === cases.length, outcomes,
    costPence: settledMicroPence / 1_000_000, numberDifferences, unaskedAddedLines: outcomes.reduce((sum, o) => sum + (o.unaskedAddedLines ?? 0), 0),
    readerA: { roomRight: readerAReport.roomRight, tradeRight: readerAReport.tradeRight, matchedLines: readerAReport.matchedLines, inventedWork: readerAReport.inventedWork, wrongNumbers: readerAReport.wrongNumbers },
    withModelReader: { roomRight: combinedReport.roomRight, tradeRight: combinedReport.tradeRight, matchedLines: combinedReport.matchedLines, inventedWork: combinedReport.inventedWork, wrongNumbers: combinedReport.wrongNumbers },
    misses: formatContextReaderReport(combinedReport).split("\n").filter(line => line.startsWith("  - ")) };
  const text = `${JSON.stringify(report, null, 1)}\n`;
  if (reportPath) writeFileSync(reportPath, text); else process.stdout.write(text);
  process.exitCode = report.complete && report.numberDifferences === 0 && report.unaskedAddedLines === 0 ? 0 : 1;
} finally {
  await pool.end();
}
