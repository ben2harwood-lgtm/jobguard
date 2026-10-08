import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_MESSAGE_EVENT_LABELS, RECOVERY_MESSAGE_STATUS_LABELS, buildRecoveryMessage, sha256 } from "@jobguard/core";
import { RECOVERY_MESSAGE_ANSWER_VERSION, RecoveryMessages, usableMessageState } from "./recovery-messages";
import { RecoveryCases, changedDelivery, merchantSourceRefsWithDelivery } from "./recovery-cases";
import { EvidencePacks } from "./evidence-packs";

// `sets` records every state write as [position of the useState call in the render, value] and `effects` the effects the render asked for, so
// the round 10 tests can run a panel's own read and command code against a stubbed fetch. The earlier tests only render markup and ignore both.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], slot: 0, sets: [] as Array<[number, unknown]>, effects: [] as Array<() => unknown> }));
vi.mock("react", async original => ({ ...(await original<typeof import("react")>()),
  useState: () => { const slot = hooks.slot++; return [hooks.values.shift(), (value: unknown) => { hooks.sets.push([slot, value]); }]; },
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
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


// ---- round 10 (Sol P3): an answer the panel cannot use is never adopted ------------------------------------------------------------------
// The panel's own `load` and command code run here against a stubbed fetch (hooks are mocked above, so the component is called as a plain
// function and its effect and button handlers are used directly). A 200 answer that is not this case's `recovery-message-response.v1`
// must leave the last good state alone, show a plain sentence, and leave "Refresh saved messages" usable: never a JavaScript error.
describe("a malformed successful answer is refused, not adopted (round 10)", () => {
  const SLOT = { state: 0, draft: 1, loading: 2, busy: 3, error: 4 } as const;
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const serverView = (status: string, over: Record<string, unknown> = {}) => {
    const { immutableContent: _omitted, ...shown } = message;
    return { id: id(7), sequence: 1, revision: 3, status, claimAbandoned: false, superseded: false, changedSinceReview: false, message: shown,
      attachment: { packId: id(3), packRevision: 1, manifestHash: message.manifestHash, contentHash: message.attachmentHash, sources: [source] },
      approval: { decisionId: id(9), authorizationId: id(10), outboxActionId: id(8), revoked: false, expiresAt: "2026-10-08T12:00:00.000Z" }, attempts: 1,
      history: [{ revision: 1, kind: "previewed", at: "2026-10-08T10:00:00.000Z" }, { revision: 2, kind: "approved", at: "2026-10-08T10:01:00.000Z" }],
      createdAt: "2026-10-08T10:00:00.000Z", ...over };
  };
  /** What the route sends: the versioned wrapper around the repository's state. */
  const answer = (status = "queued", over: Record<string, unknown> = {}) => {
    const latest = serverView(status);
    return { version: "recovery-message-response.v1", caseId: id(1), jobId: id(2), messages: [latest], latest, sink: [], sinkCount: 0, realExternalActions: 0, environment: "synthetic_demo",
      readiness: { eligible: true, reason: null, caseRevision: 2, outstandingPence: 32000, packId: id(3), packRevision: 1 }, ...over };
  };
  /** The same answer with one nested field taken away or replaced. */
  const withLatest = (change: (latest: Record<string, any>) => void) => { const body = answer(); change(body.latest as Record<string, any>); return { ...body, messages: [body.latest] }; };
  const dropped = (path: string[], value?: unknown) => withLatest(latest => {
    const holder = path.slice(0, -1).reduce((node, key) => node[key], latest);
    if (value === undefined) delete holder[path.at(-1)!]; else holder[path.at(-1)!] = value;
  });
  const malformed: Array<[string, unknown]> = [
    ["an empty object", {}], ["null", null], ["a string", "not json state"], ["a list", []],
    ["the wrong version", { ...answer(), version: "recovery-message-response.v2" }], ["no version", (({ version: _v, ...rest }) => rest)(answer())],
    ["another case's id", { ...answer(), caseId: id(99) }], ["no case id", (({ caseId: _c, ...rest }) => rest)(answer())],
    ["a message of another case", dropped(["message", "caseId"], id(99))],
    ["no readiness", (({ readiness: _r, ...rest }) => rest)(answer())],
    ["a readiness with no packId", { ...answer(), readiness: { eligible: true, reason: null, caseRevision: 2 } }],
    ["messages that are not a list", { ...answer(), messages: "none" }], ["no latest", (({ latest: _l, ...rest }) => rest)(answer())],
    ["a latest with no message", dropped(["message"])], ["a latest with no amount", dropped(["message", "amountPence"])],
    ["an amount that is text", dropped(["message", "amountPence"], "320.00")], ["a latest with no attachment", dropped(["attachment"])],
    ["an attachment with no sources", dropped(["attachment", "sources"])], ["a latest with no history", dropped(["history"])],
    ["a status the panel has no words for", dropped(["status"], "exploded")], ["a history kind the panel has no words for", dropped(["history"], [{ revision: 1, kind: "exploded" }])],
    ["a latest with no revision", dropped(["revision"])], ["no sink", (({ sink: _s, ...rest }) => rest)(answer())],
    ["a sink count that is text", { ...answer(), sinkCount: "0" }], ["a record of real external actions", { ...answer(), realExternalActions: 1 }],
  ];
  /** Mounts the panel holding `held` (the last good answer), with fetch answering from `replies` in order. Returns the fetch spy. */
  function mount(held: ReturnType<typeof answer>, replies: Array<() => Promise<unknown>>) {
    hooks.values = [held, { recipient: message.recipient, body: message.body, amount: "320.00" }, false, false, "", "success"];
    hooks.slot = 0; hooks.sets = []; hooks.effects = [];
    const queue = [...replies];
    const fetched = vi.fn(async () => { const next = queue.shift(); if (!next) throw new Error("unexpected extra fetch"); return next(); });
    globalThis.fetch = fetched as unknown as typeof fetch;
    return { tree: RecoveryMessages({ caseId: id(1), caseRevision: 2 }), fetched };
  }
  const reply = (body: unknown, ok = true) => async () => ({ ok, json: async () => body });
  const offline = async () => { throw new Error("offline"); };
  const writes = (slot: number) => hooks.sets.filter(([at]) => at === slot).map(([, value]) => value);
  const settled = (slot: number, value: unknown) => vi.waitFor(() => { expect(writes(slot).at(-1)).toBe(value); expect(writes(slot).length).toBeGreaterThan(1); });
  function buttonOf(node: unknown, label: string): { onClick: () => void } | undefined {
    if (Array.isArray(node)) { for (const child of node) { const hit = buttonOf(child, label); if (hit) return hit; } return undefined; }
    if (!node || typeof node !== "object") return undefined;
    const element = node as { type?: unknown; props?: { children?: unknown; onClick?: () => void } };
    if (element.type === "button" && element.props?.children === label) return element.props as { onClick: () => void };
    return buttonOf(element.props?.children, label);
  }
  /** What the screen would show once the panel stopped writing state: the last good answer, the error written, nothing busy. */
  const shown = (held: unknown) => {
    hooks.values = [held, { recipient: message.recipient, body: message.body, amount: "320.00" }, writes(SLOT.loading).at(-1), writes(SLOT.busy).at(-1) ?? false, writes(SLOT.error).at(-1), "success"];
    return renderToStaticMarkup(createElement(RecoveryMessages, { caseId: id(1), caseRevision: 2 }));
  };
  const refreshButton = (html: string) => html.match(/<button[^>]*>Refresh saved messages<\/button>/u)?.[0] ?? "";

  it("accepts exactly what the route sends, for every status and history kind the panel has words for", () => {
    expect(RECOVERY_MESSAGE_ANSWER_VERSION).toBe("recovery-message-response.v1");
    expect(usableMessageState(answer(), id(1))).toBeDefined();
    for (const status of Object.keys(RECOVERY_MESSAGE_STATUS_LABELS)) expect(usableMessageState(answer(status), id(1))).toBeDefined();
    const history = Object.keys(RECOVERY_MESSAGE_EVENT_LABELS).map((kind, index) => ({ revision: index + 1, kind, at: "2026-10-08T10:00:00.000Z" }));
    expect(usableMessageState(withLatest(latest => { latest.history = history; }), id(1))).toBeDefined();
    expect(usableMessageState(answer("previewed", { messages: [], latest: null }), id(1))).toBeDefined();
    const accepted = answer();
    expect(usableMessageState(accepted, id(1))).toBe(accepted); // adopted as it came, nothing the server added is dropped
  });

  it.each(malformed)("read: %s is not adopted, shows a plain sentence, keeps the last good state and stays refreshable", async (_name, body) => {
    const held = answer("queued");
    mount(held, [reply(body)]);
    expect(hooks.effects).toHaveLength(2); // the read on mount, then the focus on an error
    hooks.effects[0]!();
    await settled(SLOT.loading, false);
    expect(writes(SLOT.state)).toEqual([]);
    expect(writes(SLOT.draft)).toEqual([]);
    expect(writes(SLOT.error).at(-1)).toMatch(/saved messages could not be read, so they were not used/u);
    expect(String(writes(SLOT.error).at(-1))).not.toMatch(/TypeError|Cannot read|undefined|is not/u);
    const html = shown(held);
    expect(html).toContain("could not be read");
    expect(html).toContain(message.body); // the last good state is still on screen
    expect(refreshButton(html)).not.toContain("disabled");
  });

  it.each(malformed)("command: %s is not adopted, shows a plain sentence, keeps the last good state and stays refreshable", async (_name, body) => {
    const held = answer("outcome_unknown");
    const { tree, fetched } = mount(held, [reply(body), offline]);
    buttonOf(tree, "Check outcome")!.onClick();
    await settled(SLOT.busy, false);
    expect(fetched).toHaveBeenCalledTimes(2); // the command, then the panel's own re-read of what is saved (which here also failed)
    expect(writes(SLOT.state)).toEqual([]);
    expect(writes(SLOT.draft)).toEqual([]);
    expect(writes(SLOT.error).at(-1)).toMatch(/answer to that action could not be read, so it was not used/u);
    expect(String(writes(SLOT.error).at(-1))).not.toMatch(/TypeError|Cannot read|undefined|is not/u);
    const html = shown(held);
    expect(html).toContain("could not be read");
    expect(html).toContain("Check outcome");
    expect(refreshButton(html)).not.toContain("disabled");
  });

  it("command: an unusable answer is followed by a re-read, and a usable re-read replaces the shown state, with the sentence still shown", async () => {
    const held = answer("outcome_unknown"), saved = answer("simulated_delivery", { sinkCount: 1 });
    const { tree } = mount(held, [reply({}), reply(saved)]);
    buttonOf(tree, "Check outcome")!.onClick();
    await settled(SLOT.busy, false);
    expect(writes(SLOT.state)).toEqual([saved]);
    expect(writes(SLOT.error).at(-1)).toMatch(/could not be read, so it was not used/u);
  });

  it("preview: an unusable answer is refused the same way", async () => {
    const held = answer("previewed", { messages: [], latest: null });
    const { tree } = mount(held, [reply({}), offline]);
    buttonOf(tree, "Preview factual message")!.onClick();
    await settled(SLOT.busy, false);
    expect(writes(SLOT.state)).toEqual([]);
    expect(writes(SLOT.error).at(-1)).toMatch(/could not be read, so it was not used/u);
  });

  it("a refusal body that is not an object is a plain failure, never a JavaScript error, on both paths", async () => {
    const held = answer("outcome_unknown");
    mount(held, [reply(null, false)]);
    hooks.effects[0]!();
    await settled(SLOT.loading, false);
    expect(writes(SLOT.error).at(-1)).toBe("That did not work. The saved state is shown; try again.");
    const { tree } = mount(held, [reply(null, false), reply(null, false)]);
    buttonOf(tree, "Check outcome")!.onClick();
    await settled(SLOT.busy, false);
    expect(writes(SLOT.error).at(-1)).toBe("That did not work. The saved state is shown; try again.");
    expect(writes(SLOT.state)).toEqual([]);
  });

  it("control: a usable answer is adopted on both paths and clears the error", async () => {
    const held = answer("outcome_unknown"), next = answer("retryable");
    mount(held, [reply(next)]);
    hooks.effects[0]!();
    await settled(SLOT.loading, false);
    expect(writes(SLOT.state)).toEqual([next]);
    expect(writes(SLOT.error)).toEqual([""]);
    const { tree } = mount(held, [reply(next), reply(next)]);
    buttonOf(tree, "Check outcome")!.onClick();
    await settled(SLOT.busy, false);
    expect(writes(SLOT.state)[0]).toBe(next);
    expect(writes(SLOT.error).filter(value => value !== "")).toEqual([]);
  });
});
