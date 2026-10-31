import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { extractCaptureFixture } from "@jobguard/ai";
import { ShadowJourney, ShadowSavedReport } from "./journey";
import { parseShadowReport, shadowCaptureText, shadowSteps } from "./journey-model";
vi.stubGlobal("React", React);
const jobId = randomUUID();
function report() { return {
 version: "shadow-demo-report.v1", environment: "synthetic_demo", jobId, status: "incomplete", realExternalActions: 0, customerApproval: "not_ready_yet",
 account: { jobId, account: null, captures: [], lock: null },
 invoices: { version: 1, environment: "synthetic_demo", jobId, invoices: [] },
 value: { status: "incomplete", reason: "producer_bindings_held" },
}; }
it("has nine guided steps, source-only £30,000 input and no saved success before a read", async () => {
 expect(shadowSteps).toHaveLength(9);
 const proposal = await extractCaptureFixture(randomUUID(), shadowCaptureText, "deterministic-local-v1");
 expect(proposal.lines).toHaveLength(5);
 expect(proposal.lines.reduce((total, line) => total + (line.unitPricePence.value ?? 0), 0)).toBe(3000000);
 const html = renderToStaticMarkup(<ShadowJourney />);
 for (const text of ["£3,200", "£400", "£500", "£300", "£34,400", "£41,280", "Q £800", "£80", "£720", "£3,600", "£0", "not ready yet (MON-5)"]) expect(html).toContain(text);
 expect(html).not.toContain("Saved job evidence"); expect(html).not.toContain("You finished");
});
it("reports every capture state fee-free without implying customer approval or verified payment", () => {
 const raw = report();
 const parsed = parseShadowReport({ ...raw, account: { ...raw.account, captures: ["draft", "priced", "approved", "rejected", "withdrawn"].map((state, i) => ({ id: randomUUID(), state, description: `Fictional capture ${i}`, origin: i === 0 ? "final_review" : "builder_logged", netPence: i === 0 ? 40000 : 320000 })) } }, jobId);
 const html = renderToStaticMarkup(<ShadowSavedReport report={parsed} />);
 expect(html.match(/recovery fee £0/gu)).toHaveLength(5); expect(html).toContain("No invoice issued"); expect(html).toContain("MON-5");
 expect(html).toContain("CH-8"); expect(html).toContain("CH-9"); expect(html).not.toContain("SV-6 historical assessments");
});
it("rejects another job, pre-lock reveal/count/history/pack leaks and client completion flags", () => {
 const raw = report();
 for (const extra of [{ jobId: randomUUID() }, { finalCheck: { state: "unlocked", items: [] } }, { assessments: [] }, { packs: [] }, { hiddenCount: 0 }, { completed: true }, { realExternalActions: 1 }]) expect(() => parseShadowReport({ ...raw, ...extra }, jobId)).toThrow();
 expect(() => parseShadowReport({ ...raw, account: { ...raw.account, jobId: randomUUID() } }, jobId)).toThrow();
 expect(() => parseShadowReport({ ...raw, invoices: { ...raw.invoices, jobId: randomUUID() } }, jobId)).toThrow();
});
it("rejects a reveal from a different locked bill", () => {
 const raw = report();
 expect(() => parseShadowReport({ ...raw, account: { ...raw.account, lock: { id: randomUUID(), finalAccountRevisionId: randomUUID(), lockedAt: "2026-10-29T00:00:00Z", digest: "a".repeat(64) } }, finalCheck: { state: "completed", lockId: randomUUID(), items: [] } }, jobId)).toThrow("Wrong lock report");
});
