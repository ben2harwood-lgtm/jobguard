import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildRecoveryMessage, sha256 } from "@jobguard/core";
import { RecoveryMessages } from "./recovery-messages";
import { RecoveryCases } from "./recovery-cases";
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


describe('supplier recovery source picker (Sol 5)', () => {
  it('offers the recorded fictional partial delivery as an explicit selection', () => {
    hooks.values = [0, [], undefined, '', false, '1000.00', [{ id: id(20), document_type: 'delivery', status: 'ready' }], id(20)];
    const html = renderToStaticMarkup(createElement(RecoveryCases, { jobId: id(2) }));
    expect(html).toContain('Fictional delivery source');
    expect(html).toContain(`value="${id(20)}"`);
    expect(html).toContain('materials-B partial delivery — 10 each delivered, 8 accepted');
  });
});
