import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { JobRecordProposal } from "@jobguard/core";
import { extractCaptureFixture } from "./capture.js";
import { parseCaptureFixture } from "./capture-fixture-parser.js";
import { evaluateCapture, validateCorpus, type WalkaroundLabel, type WalkaroundSource } from "./capture-evaluation.js";
import { MUTATIONS, runCaptureEvaluation } from "./evaluation-runner.js";
import { evaluationMain } from "./evaluation-cli.js";
const sources: WalkaroundSource[] = JSON.parse(readFileSync(new URL("../../../docs/fixtures/ai/walkarounds.v1.json", import.meta.url), "utf8")).cases;
const labels: WalkaroundLabel[] = JSON.parse(readFileSync(new URL("../../../docs/fixtures/ai/labels.v1.json", import.meta.url), "utf8")).cases;
function changed(id: string, mutate: (proposal: JobRecordProposal) => void) {
  const source = sources.find(item => item.id === id)!;
  const output = parseCaptureFixture(id, source.text);
  mutate(output);
  return evaluateCapture(source, labels.find(item => item.id === id)!, output, id);
}
describe("labelled synthetic capture evaluation", () => {
  it.each(sources)("runs $id through the real fixture gateway against separately stored labels", async source => {
    const sourceId = `evaluation:${source.id}`;
    const output = await extractCaptureFixture(sourceId, source.text, `eval-${source.id}`);
    const result = evaluateCapture(source, labels.find(item => item.id === source.id)!, output, sourceId);
    expect(result.errors).toEqual([]); expect(result.passed).toBe(true);
  });
  const regressions: Array<[string, (p: JobRecordProposal) => void]> = [
    ["omitted scope", p => { p.lines.pop(); }],
    ["invented monetary fact", p => { p.lines[0]!.unitPricePence.value = 99999; }],
    ["unsafe monetary fact", p => { p.lines[0]!.unitPricePence.value = 1_000_000_000_001; }],
    ["wrong source", p => { const v=p.lines[0]!.description.provenance;if(v.kind==="extracted")v.span.sourceId="another-source"; }],
    ["out-of-bounds citation", p => { const v=p.lines[0]!.description.provenance;if(v.kind==="extracted")v.span.end=999999; }],
    ["empty citation", p => { const v=p.lines[0]!.description.provenance;if(v.kind==="extracted")v.span.end=v.span.start; }],
    ["same-valued price from a different work line", p => { p.lines[0]!.unitPricePence.provenance=structuredClone(p.lines[1]!.unitPricePence.provenance); }],
    ["uncited inferred money", p => { p.lines[0]!.unitPricePence.provenance={kind:"inferred",note:"Synthetic unsupported guess"}; }],
    ["duplicate scope", p => { p.lines.push(structuredClone(p.lines[0]!)); }],
    ["missing questions", p => { p.questions=[]; }],
    ["invented scope description", p => { p.lines[0]!.description.value="New invented work"; }],
  ];
  it.each(regressions)("fails on %s", (_name, mutate) => expect(changed("walk-01", mutate).passed).toBe(false));
  it("does not silently turn an uncertain quantity into one", () => {
    expect(changed("walk-03", p => { p.lines[0]!.quantity.value="1"; }).passed).toBe(false);
    expect(changed("walk-03", p => { p.questions=p.questions.slice(0,1); }).passed).toBe(false);
  });
  it("keeps repeated descriptions and title mentions bound to their exact source positions", () => {
    const repeated=sources.find(s=>s.id==="walk-13")!, proposal=parseCaptureFixture(repeated.id,repeated.text);
    const first=proposal.lines[0]!.description.provenance, second=proposal.lines[1]!.description.provenance;
    expect(first.kind).toBe("extracted");expect(second.kind).toBe("extracted");
    if(first.kind==="extracted"&&second.kind==="extracted")expect(first.span.start).not.toBe(second.span.start);
    const titleSource=sources.find(s=>s.id==="walk-28")!, title=parseCaptureFixture(titleSource.id,titleSource.text).title.provenance;
    expect(title.kind).toBe("extracted");
    if(title.kind==="extracted")expect(title.span.start).toBe(titleSource.text.indexOf("Synthetic repeat",titleSource.text.indexOf("JOB:")));
  });
  it("requires sufficient paired cases and rejects duplicate identities", () => {
    validateCorpus(sources,labels);
    expect(()=>validateCorpus(sources.slice(0,19),labels.slice(0,19))).toThrow();
    expect(()=>validateCorpus([...sources.slice(0,-1),sources[0]!],labels)).toThrow();
    expect(()=>validateCorpus(sources,[...labels.slice(0,-1),labels[0]!])).toThrow();
  });
  it.each(["", " ", "x".repeat(50001), "ITEM: | £10.00", "x".repeat(501), Array(101).fill("ITEM: Test | £1").join("\n")])("bounds malformed or unsupported fixture input %#", text => {
    expect(()=>parseCaptureFixture("source",text)).toThrow();
  });
  it("does not allow expected labels, commercial tools or I/O inside the pure parser", () => {
    const source=readFileSync(new URL("./capture-fixture-parser.ts",import.meta.url),"utf8");
    expect(source).not.toMatch(/labels\.v1|walkarounds\.v1|evaluation-runner|child_process|fetch\s*\(|eval\s*\(/u);
  });
});
describe("evaluation CLI and receipts", () => {
  it("records reproducible versions, source hashes, counts and honest limits", async () => {
    const a=await runCaptureEvaluation(),b=await runCaptureEvaluation();
    expect(a.status).toBe("PASS");expect(a.cases).toEqual({passed:32,total:32});
    expect(a.totals).toEqual({scopeIntentRecall:{numerator:41,denominator:41},citations:{valid:119,total:119},unsupportedMonetaryFacts:0,ambiguityChecks:{passed:63,total:63}});
    expect(a.hashes).toEqual(b.hashes);expect(a.results).toEqual(b.results);
    expect(a.versions.parser).toBe("structured-capture-fixture/2");expect(a.costPence).toBe(0);
    expect(a.releaseDecision).toBe("NOT_AUTHORIZED");expect(a.labelStatus).toBe("AUTHOR_PROPOSED_INDEPENDENT_REVIEW_PENDING");
    expect(a.notTested).toContain("Live model or natural-language extraction accuracy");
    console.log("CAPTURE_EVALUATION_RECEIPT",JSON.stringify({schema:a.schema,status:a.status,cases:a.cases,totals:a.totals,versions:a.versions,hashes:a.hashes,labelStatus:a.labelStatus,notTested:a.notTested}));
  });
  it.each(MUTATIONS)("returns non-zero for the %s negative control", async mutation => {
    let text="";const exit=await evaluationMain(["--mutation",mutation],output=>{text+=output;});
    expect(exit).toBe(1);const report=JSON.parse(text);
    expect(report.status).toBe("FAIL");expect(report.cases.passed).toBe(31);expect(report.results[0].errors.length).toBeGreaterThan(0);
  });
  it("runs the no-argument CLI and rejects unsupported modes instead of pretending to run live AI", async () => {
    let text="";expect(await evaluationMain([],value=>{text+=value;})).toBe(0);expect(JSON.parse(text).status).toBe("PASS");
    text="";expect(await evaluationMain(["--live"],value=>{text+=value;})).toBe(2);expect(JSON.parse(text).code).toBe("INVALID_ARGUMENTS");
  });
});
