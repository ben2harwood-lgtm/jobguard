import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildRecoveryMessage, sha256 } from "@jobguard/core";
import { RecoveryMessages } from "./recovery-messages";
import { RecoveryCases, changedDelivery, merchantSourceRefsWithDelivery } from "./recovery-cases";
import { EvidencePacks } from "./evidence-packs";

const hooks = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock("react", async original => ({ ...(await original<typeof import("react")>()),
  useState: () => [hooks.values.shift(), () => undefined], useEffect: () => undefined,
  useCallback: (fn: unknown) => fn, useRef: () => ({ current: null }),
}));
vi.stubGlobal("React", React);
const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const message = buildRecoveryMessage({ caseId: id(1), jobId: id(2), caseType: "withheld_customer_payment", caseRevision: 2,
  amountPence: 32000, sourceRefs: [id(5)], packId: id(3), packRevision: 1, manifestHash: "a".repeat(64), attachmentHash: "b".repeat(64) });
const source = { sourceId: `evidence_object:${id(5)}`, version: 1, label: "Saved original proof", kind: "proof", content: "saved proof bytes", contentHash: sha256("saved proof bytes") };
function render(status: string, claimAbandoned = false) {
  const view = { id: id(7), sequence: 1, revision: 3, status, claimAbandoned, superseded: false, changedSinceReview: false, message,
    attachment: { packId: id(3), packRevision: 1, manifestHash: message.manifestHash, contentHash: message.attachmentHash, sources: [source] },
    approval: { outboxActionId: id(8) }, attempts: 1, history: [{ revision: 1, kind: "previewed" }, { revision: 2, kind: "approved" }] };
  const state = { caseId: id(1), jobId: id(2), messages: [view], latest: view, sink: [], sinkCount: 0, realExternalActions: 0,
    readiness: { eligible: true, packId: id(3), caseRevision: 2 } };
  hooks.values = [state, { recipient: message.recipient, body: message.body, amount: "320.00" }, false, false, "", "success"];
  return renderToStaticMarkup(createElement(RecoveryMessages, { caseId: id(1), caseRevision: 2 }));
}
describe("saved recovery message controls and sources", () => {
  it.each(["queued", "outcome_unknown"])("keeps %s visible and refuses to hide it behind another preview (P2-3)", status => {
    const html = render(status);
    const preview = html.match(/<button[^>]*>Preview factual message<\/button>/u)?.[0];
    expect(preview).toContain("disabled");
    expect(html).toContain(status === "queued" ? "Revoke approval" : "Check outcome");
  });
  it("labels an abandoned claim and offers checking without another advance (P2-6)", () => {
    const html = render("outcome_unknown", true);
    expect(html).toContain("Outcome unknown — check needed");
    expect(html).toContain("The delivery process stopped before its result was recorded");
    expect(html).toContain("Check outcome");
    expect(html).not.toContain("Advance practice delivery");
  });
  it("displays exhausted failure without offering another advance", () => {
    const html = render("failed");
    expect(html).toContain("Delivery failed repeatedly — nothing sent");
    expect(html).not.toContain("Advance practice delivery");
  });
  it("keeps every source anchor and its saved content even if the current pack no longer contains it (P3-10)", () => {
    const html = render("blocked");
    hooks.values = [[], false, false, "", "intact", null, false];
    const explorer = renderToStaticMarkup(createElement(EvidencePacks, { caseId: id(1), claimedNetPence: 32000 }));
    const hrefs = [...html.matchAll(/href="#([^"]+)"/gu)].map(match => match[1]);
    expect(hrefs).toHaveLength(1);
    for (const anchor of hrefs) expect(html + explorer).toContain(`id="${anchor}"`);
    expect(html).toContain("saved proof bytes");
    expect(html).toContain(source.contentHash);
    expect(html).toContain(id(3));
  });
});


// RecoveryCases' useState calls in the order the component makes them (this file replaces useState with a positional mock): packTick, deliveries, deliveryId, then M4-1-S-R's
// cases, status, selected, error, busy, amount, claimAmount, reverseAmount, errorSeq, and last the unresolved-attempt flags unsure and needsReload.
const workbenchState = (deliveries: unknown[], deliveryId: string) => [0, deliveries, deliveryId, [], 'ready', undefined, '', false, '1000.00', '', '', 0, false, false];
describe('supplier recovery source picker (Sol 5)', () => {
  it('offers the recorded fictional partial delivery as an explicit selection', () => {
    hooks.values = workbenchState([{ id: id(20), document_type: 'delivery', status: 'ready', document_number: 'DN-FICTIONAL-42' }], id(20));
    const html = renderToStaticMarkup(createElement(RecoveryCases, { jobId: id(2) }));
    expect(html).toContain('Fictional delivery source');
    expect(html).toContain(`value="${id(20)}"`);
    expect(html).toContain('DN-FICTIONAL-42');
    expect(html).not.toContain('10 each delivered, 8 accepted');
    expect(html).toContain('>DN-FICTIONAL-42</option>');
  });
  it.each([['empty', ''], ['blank', '   '], ['missing', null]])('labels a delivery whose number is %s with a short plain label, not a bare separator and id (P3-1)', (_name, documentNumber) => {
    hooks.values = workbenchState([{ id: id(21), document_type: 'delivery', status: 'ready', document_number: documentNumber }], id(21));
    const html = renderToStaticMarkup(createElement(RecoveryCases, { jobId: id(2) }));
    expect(html).toContain(`<option value="${id(21)}" selected="">Document ${id(21).slice(0, 8)}</option>`);
    expect(html).not.toContain(' · ');
  });
});

// The delivery rule behind "Open materials-320 overcharge" (round 9): a pure function, so it is tested on its own and not through the picker's markup.
describe('opening the materials-320 claim with an explicitly chosen delivery', () => {
  const rate = id(30), invoiceVersion = id(31), delivery = id(32), otherDelivery = id(33), invoiceDocument = id(34);
  const recorded = { materials: [{ quantity: '40', eachPence: 2000, rateId: rate }], facts: [{ document_number: 'INV-M320-001', version_id: invoiceVersion }] };
  const unmatched = { materials: [], facts: [] };
  const practice = ['Supplier agreement AG-320', 'Delivery note DN-320', 'Supplier invoice INV-320'];
  const row = (over: Record<string, unknown> = {}) => ({ id: delivery, document_type: 'delivery', status: 'ready', document_number: 'DN-FICTIONAL-42', ...over });
  const answer = (...rows: unknown[]) => ({ state: { facts: [], documents: rows } });

  it('adds nothing when no delivery is chosen, exactly as before the delivery list existed', () => {
    expect(merchantSourceRefsWithDelivery(recorded, answer(row()), '')).toEqual([rate, invoiceVersion]);
    expect(merchantSourceRefsWithDelivery(recorded, { state: { facts: [] } }, '')).toEqual([rate, invoiceVersion]);
  });
  it('appends the chosen ready delivery after the recorded rate and invoice version, in that order', () => {
    expect(merchantSourceRefsWithDelivery(recorded, answer(row(), row({ id: otherDelivery })), delivery)).toEqual([rate, invoiceVersion, delivery]);
    expect(merchantSourceRefsWithDelivery(recorded, answer(row({ document_number: null })), delivery)).toEqual([rate, invoiceVersion, delivery]);
  });
  it('never puts a recorded delivery beside the fixed practice labels, which identify nothing', () => {
    expect(merchantSourceRefsWithDelivery(unmatched, answer(row()), delivery)).toEqual(practice);
    expect(merchantSourceRefsWithDelivery(unmatched, answer(row()), '')).toEqual(practice);
  });
  it.each([
    ['is no longer listed', answer(row({ id: otherDelivery }))],
    ['is not a delivery any more', answer(row({ document_type: 'invoice' }))],
    ['is no longer ready', answer(row({ status: 'held' }))],
    ['is listed by an answer that carries no document list', { state: { facts: [] } }],
  ])('refuses to open when the chosen delivery %s', (_name, body) => {
    expect(() => merchantSourceRefsWithDelivery(recorded, body, delivery)).toThrow(changedDelivery);
    expect(() => merchantSourceRefsWithDelivery(unmatched, body, delivery)).toThrow(changedDelivery);
  });
  it.each([
    ['a document list that is not a list', { state: { facts: [], documents: 'none' } }],
    ['a null document list', { state: { facts: [], documents: null } }],
    ['a row with no id', answer(row({ id: undefined }))],
    ['a row whose id is not a uuid', answer(row({ id: 'not-a-uuid' }))],
    ['a row whose id is a number', answer(row({ id: 7 }))],
    ['a row with no document type', answer(row({ document_type: undefined }))],
    ['a row with no status', answer(row({ status: undefined }))],
    ['a row whose document number is a number', answer(row({ document_number: 42 }))],
    ['a null row', answer(row(), null)],
    ['one good row and one bad row', answer(row(), row({ id: otherDelivery, status: 7 }))],
    ['an answer with no state', {}],
    ['an answer that is not an object', 'text'],
  ])('treats %s as an unusable supplier lookup, whether or not a delivery is chosen', (_name, body) => {
    expect(merchantSourceRefsWithDelivery(recorded, body, '')).toBeUndefined();
    expect(merchantSourceRefsWithDelivery(recorded, body, delivery)).toBeUndefined();
  });
  it('keeps the document id of the invoice out of the case: only the delivery chosen is added', () => {
    expect(merchantSourceRefsWithDelivery(recorded, answer(row(), row({ id: invoiceDocument, document_type: 'invoice' })), delivery)).toEqual([rate, invoiceVersion, delivery]);
  });
});
