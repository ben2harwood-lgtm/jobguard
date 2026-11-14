import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { PracticeJourney } from "./practice-journey";
import { WorkspaceShell } from "./workspace-shell";
import { ProofStage } from "./proof-stage";
import { JobVariations } from "./job-variations";
import { JobFinalAccount } from "./job-final-account";
import { CustomerInvoices } from "./customer-invoices";

const hooks = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock("react", async original => ({
 ...await original<typeof React>(), useContext: () => 0,
 useState: (initial: unknown) => [hooks.values.length ? hooks.values.shift() : typeof initial === "function" ? initial() : initial, vi.fn()],
 useRef: (current: unknown) => ({ current }),
 useCallback: (fn: unknown) => fn,
 useEffect: () => undefined,
}));
afterEach(() => { hooks.values = []; vi.unstubAllGlobals(); });
const jobId = "11111111-1111-4111-8111-111111111112";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const snapshot = { proofComplete: true, variationsApproved: true, invoiceIssued: true, invoiceId, balancePence: 0, feePrepared: false, realExternalActions: 0 };
function card(status: string, changes = {}) {
 vi.stubGlobal("React", React);
 hooks.values = [{ jobId, status, phase: "ready", snapshot: { ...snapshot, ...changes } }];
 return renderToStaticMarkup(PracticeJourney({ jobId, status }));
}
function target(html: string) {
 const match = html.match(/data-testid="uiwire15-continue" href="#([^"]+)"/u);
 expect(match).not.toBeNull();
 return match![1]!;
}
it.each(["draft", "quoting", "accepted", "live", "invoiced", "paid", "lost"])("renders a real Continue destination for %s", status => {
 const id = target(card(status));
 hooks.values = [null, { jobId, status, proposal: { title: "Fictional job", lines: [], questions: [] }, review: null, source: { kind: "text", text: "Fictional job", version: 1 } }, null, false, ""];
 const html = renderToStaticMarkup(WorkspaceShell({ jobId }));
 expect(html).toContain(` id="${id}"`);
});
it("uses the existing proof section for incomplete live work", () => {
 const id = target(card("live", { proofComplete: false }));
 expect(renderToStaticMarkup(<ProofStage jobId={jobId}/>)).toContain(` id="${id}"`);
});
it("uses the existing variations heading for extras", () => {
 const id = target(card("live", { variationsApproved: false }));
 hooks.values = [{ variations: [], approvedAdditionsPence: 0, approvedOmissionsPence: 0, pendingExtrasPence: 0, baselinePence: 0 }];
 expect(renderToStaticMarkup(<JobVariations jobId={jobId}/>)).toContain(` id="${id}"`);
});
it("uses the final-account heading without inventing a job total", () => {
 const html = card("live", { invoiceIssued: false, invoiceId: null });
 expect(html).toContain("Build and issue the final invoice");
 expect(html).not.toContain("£1,320");
 const id = target(html);
 hooks.values = [{ account: null }, false];
 expect(renderToStaticMarkup(<JobFinalAccount jobId={jobId}/>)).toContain(` id="${id}"`);
});
it("uses this job's actual invoice identity for the payment step", () => {
 const id = target(card("live", { balancePence: 500 }));
 const invoice = { id: invoiceId, number: "SYN-1", issuedOn: "2026-11-09", pdfSha256: "a".repeat(64), totalPence: 500, balancePence: 500, delivery: "simulated_delivery" };
 hooks.values = [{ jobId, invoices: [invoice] }, false];
 expect(renderToStaticMarkup(<CustomerInvoices jobId={jobId} finalAccount={{ id: jobId, sourceHash: "a".repeat(64), issueBlocked: false }}/>)).toContain(` id="${id}"`);
});
