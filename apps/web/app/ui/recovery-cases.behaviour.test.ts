import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RecoveryCases } from "./recovery-cases";

/**
 * M4-1-S-R repair 12 (Sol round 12): the REAL workbench component, driven through a minimal hook runtime and a fetch whose every answer the test releases by hand.
 *
 * The web package has no DOM or React test renderer, so React's four hooks are replaced by a tiny deterministic runtime (render, batched state updates, effects with
 * cleanups). Nothing about the component is mocked: it renders its real element tree, and the tests read buttons and text from that tree and press the buttons'
 * real onClick handlers. Every answer is a plain object, so the order in which answers arrive is exactly the order the test chooses.
 */
const rt = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: readonly unknown[] | undefined; cleanup?: unknown; ref?: { current: unknown }; set?: (next: unknown) => void };
  type Instance = {
    slots: Slot[]; cursor: number; effects: Array<() => void>; props: unknown; tree: unknown; failure: unknown; scheduled: boolean; unmounted: boolean;
    component: (props: unknown) => unknown; flush: () => void; markDirty: () => void;
  };
  let active: Instance | undefined;
  const changed = (a?: readonly unknown[], b?: readonly unknown[]) => !a || !b || a.length !== b.length || a.some((item, index) => !Object.is(item, b[index]));
  const slot = (): Slot => { const inst = active!; const index = inst.cursor++; return inst.slots[index] ??= {}; };
  const api = {
    useState(initial: unknown) {
      const inst = active!, s = slot();
      if (!s.set) {
        s.value = typeof initial === "function" ? (initial as () => unknown)() : initial;
        s.set = next => { const value = typeof next === "function" ? (next as (old: unknown) => unknown)(s.value) : next; if (!Object.is(value, s.value)) { s.value = value; inst.markDirty() } };
      }
      return [s.value, s.set];
    },
    useRef(initial: unknown) { const s = slot(); s.ref ??= { current: initial }; return s.ref },
    useCallback(fn: unknown, deps?: readonly unknown[]) { const s = slot(); if (changed(s.deps, deps)) { s.deps = deps; s.value = fn } return s.value },
    useEffect(fn: () => unknown, deps?: readonly unknown[]) {
      const inst = active!, s = slot();
      if (changed(s.deps, deps)) { s.deps = deps; inst.effects.push(() => { const previous = s.cleanup; if (typeof previous === "function") previous(); s.cleanup = fn() }) }
    },
  };
  function mount(component: (props: unknown) => unknown, props: unknown): Instance {
    const inst: Instance = {
      slots: [], cursor: 0, effects: [], props, tree: undefined, failure: undefined, scheduled: false, unmounted: false, component,
      flush() {
        inst.scheduled = false;
        if (inst.unmounted) return;
        try { active = inst; inst.cursor = 0; inst.effects = []; inst.tree = inst.component(inst.props) } catch (error) { inst.failure ??= error } finally { active = undefined }
        const run = inst.effects; inst.effects = [];
        for (const effect of run) { try { effect() } catch (error) { inst.failure ??= error } }
      },
      // State updates are batched like React's: one render per turn, after the handler or answer that made them.
      markDirty() { if (!inst.scheduled) { inst.scheduled = true; queueMicrotask(inst.flush) } },
    };
    inst.flush();
    return inst;
  }
  const unmount = (inst: Instance) => { inst.unmounted = true; for (const s of inst.slots) if (typeof s.cleanup === "function") s.cleanup() };
  return { api, mount, unmount };
});

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, default: actual, useState: rt.api.useState, useRef: rt.api.useRef, useCallback: rt.api.useCallback, useEffect: rt.api.useEffect };
});

type El = { type: unknown; props: { children?: unknown; disabled?: boolean; onClick?: (event: unknown) => unknown; [key: string]: unknown } };
const isElement = (node: unknown): node is El => typeof node === "object" && node !== null && "props" in node && "type" in node;
function* walk(node: unknown): Generator<El> {
  if (Array.isArray(node)) { for (const child of node) yield* walk(child); return }
  if (!isElement(node)) return;
  yield node;
  if (typeof node.type === "string") yield* walk(node.props.children);
}
const textOf = (node: unknown): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return isElement(node) && typeof node.type === "string" ? textOf(node.props.children) : "";
};

const JOB_A = "11111111-1111-4111-8111-111111111111", JOB_B = "22222222-2222-4222-8222-222222222222";
const CASE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", CASE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STATES = ["identified", "evidence_assembled", "pursuing", "negotiating", "partially_landed", "landed", "closed_recovered", "closed_no_recovery", "prevented"] as const;
const caseView = (over: Record<string, unknown> = {}) => ({
  id: CASE_A, jobId: JOB_A, caseType: "withheld_customer_payment", state: "identified", claimedNetPence: 32000, landedNetPence: 0, outstandingNetPence: 32000, writtenOffPence: 0, currency: "GBP",
  counterparty: "Fictional Customer", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"],
  sources: [{ ref: "Generated customer invoice INV-18800", kind: "Customer invoice", label: "Generated customer invoice INV-18800", recorded: false }],
  feeJobLiabilityPence: 0, feeObligationsPostedPence: 0, feeCompensationsPostedPence: 0, approvedLandedNetPence: 0, revision: 1, reviewerRef: "membership:fictional", createdDate: "2026-10-05", eligibility: null, ...over,
});
const answerBody = (cases: unknown[], affectedCaseId?: string) => ({ version: "recovery-case-workbench.v1", environment: "synthetic_demo", realExternalActions: 0, cases, ...(affectedCaseId === undefined ? {} : { affectedCaseId }) });

type Call = { url: string; method: string; body: unknown; json: (body: unknown, status?: number) => void; raw: (status?: number) => void; reject: () => void };
const respond = (body: unknown, status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });

let calls: Call[] = [];
// The recorded-source lookups a practice button makes before it sends a command. Each answers at once, with a body a test can replace per lookup.
type Lookup = { status: number; body: unknown; notJson?: boolean };
const emptyLookups = (): Record<string, Lookup> => ({ "customer-invoices": { status: 200, body: { invoices: [] } }, materials: { status: 200, body: { materials: [] } }, "supplier-documents": { status: 200, body: { state: { facts: [] } } } });
let lookups = emptyLookups();
// Repair 13: a test can hold every recorded-source lookup open and release them by hand, so a lookup can finish after the job has changed or the workbench is gone.
let lookupGate: Promise<void> | undefined;
let lookupRequests: string[] = [];
const holdLookups = () => { let release: () => void = () => undefined; lookupGate = new Promise<void>(resolve => { release = resolve }); return { release: () => release() } };
const reads = () => calls.filter(call => call.method === "GET");
const writes = () => calls.filter(call => call.method === "POST");

afterEach(() => { vi.unstubAllGlobals() });

beforeAll(() => {
  // The web tsconfig keeps JSX as "preserve" for Next, so vitest compiles it with the classic runtime and the component needs a global React at render time.
  (globalThis as { React?: typeof React }).React = React;
});

function start(jobId = JOB_A) {
  calls = [];
  lookups = emptyLookups();
  lookupGate = undefined;
  lookupRequests = [];
  vi.stubGlobal("fetch", (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input), method = init?.method ?? "GET";
    // The practice buttons look up the job's recorded sources first; none are recorded, so the fixed fictional labels are used.
    const lookup = lookups[url.split("/").at(-1) ?? ""];
    if (lookup) {
      lookupRequests.push(url);
      const answer = lookup.notJson ? { ok: lookup.status < 300, status: lookup.status, json: async () => { throw new SyntaxError("Unexpected token < in JSON at position 0") } } : respond(lookup.body, lookup.status);
      return lookupGate ? lookupGate.then(() => answer) : Promise.resolve(answer);
    }
    if (!url.includes("/recovery-cases")) return Promise.reject(new Error(`unexpected request ${url}`));
    return new Promise(resolve => {
      calls.push({
        url, method, body: init?.body === undefined ? undefined : JSON.parse(init.body),
        json: (body, status = 200) => resolve(respond(body, status)),
        raw: (status = 200) => resolve({ ok: status >= 200 && status < 300, status, json: async () => { throw new SyntaxError("Unexpected token < in JSON at position 0") } }),
        reject: () => resolve(Promise.reject(new TypeError("Failed to fetch")) as never),
      });
    });
  });
  const inst = rt.mount(RecoveryCases as never, { jobId });
  const settle = async () => { for (let turn = 0; turn < 4; turn++) await new Promise(resolve => setTimeout(resolve, 0)); if (inst.failure) throw inst.failure };
  const screen = () => {
    const tree = inst.tree;
    const buttons = [...walk(tree)].filter(el => el.type === "button");
    const named = (name: string) => buttons.find(button => textOf(button.props.children).trim() === name);
    return {
      text: () => textOf(tree),
      button: (name: string) => { const found = named(name); if (!found) throw new Error(`no button "${name}" on screen`); return found },
      hasButton: (name: string) => named(name) !== undefined,
      alert: () => [...walk(tree)].filter(el => el.props.role === "alert").map(el => textOf(el.props.children)).join(" | "),
      testId: (id: string) => [...walk(tree)].filter(el => el.props["data-testid"] === id).map(el => textOf(el.props.children)).join(""),
    };
  };
  // A user can only press a button that is enabled; this is that press.
  const click = (name: string) => { const button = screen().button(name); if (button.props.disabled) throw new Error(`"${name}" is disabled`); void button.props.onClick?.({ preventDefault() {} }) };
  // The pre-repair workbench left these buttons enabled during the first read, so a press could happen. This sends that press whatever the button's state is, to prove the
  // ordering defence holds on its own and does not rely on the button being disabled.
  const forceClick = (name: string) => { void screen().button(name).props.onClick?.({ preventDefault() {} }) };
  return { inst, settle, screen, click, forceClick, rerender: (next: string) => { inst.props = { jobId: next }; inst.flush() }, unmount: () => rt.unmount(inst) };
}

const OPEN_BUTTONS = ["Open materials-320 overcharge", "Open £320 withheld payment", "Open £2,500 withheld payment", "Record prevention"];

describe("M4-1-S-R repair 12, Sol P2-1: a late read can never erase a command result", () => {
  it("keeps every way of opening a case disabled until the first read has settled", async () => {
    const w = start();
    await w.settle();
    expect(reads()).toHaveLength(1);
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(true);
    reads()[0]!.json(answerBody([]));
    await w.settle();
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
  });

  it("keeps the case a command opened when the first read, answered before the command, is delivered afterwards with an empty register", async () => {
    const w = start();
    await w.settle();
    w.forceClick("Open £320 withheld payment");
    await w.settle();
    expect(writes()).toHaveLength(1);
    writes()[0]!.json(answerBody([caseView()], CASE_A));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    // The stale snapshot: the register as it was before the case existed.
    reads()[0]!.json(answerBody([]));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    expect(w.screen().text()).not.toContain("No recovery cases yet");
    expect(w.screen().text()).not.toContain("Loading recovery cases");
  });

  it("does not let a first read that fails after a command result hide that result", async () => {
    const w = start();
    await w.settle();
    w.forceClick("Open £320 withheld payment");
    await w.settle();
    writes()[0]!.json(answerBody([caseView()], CASE_A));
    await w.settle();
    reads()[0]!.reject();
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    expect(w.screen().alert()).toBe("");
    expect(w.screen().hasButton("Try again")).toBe(false);
  });

  it("ignores a command result that arrives after the workbench has moved to another job", async () => {
    const w = start(JOB_A);
    await w.settle();
    reads()[0]!.json(answerBody([]));
    await w.settle();
    w.click("Open £320 withheld payment");
    await w.settle();
    w.rerender(JOB_B);
    await w.settle();
    expect(reads()).toHaveLength(2);
    // Job A's command finishes while job B is still being read.
    writes()[0]!.json(answerBody([caseView()], CASE_A));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("");
    expect(w.screen().text()).toContain("Loading recovery cases");
    reads()[1]!.json(answerBody([]));
    await w.settle();
    expect(w.screen().text()).toContain("No recovery cases yet");
    expect(w.screen().testId("case-claimed-net")).toBe("");
    // Job A's command is over as far as job B is concerned: job B's controls are not left locked by it.
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
  });

  it("ignores a read for the previous job that is delivered after the next job's read", async () => {
    const w = start(JOB_A);
    await w.settle();
    w.rerender(JOB_B);
    await w.settle();
    expect(reads()).toHaveLength(2);
    reads()[1]!.json(answerBody([caseView({ id: CASE_B, jobId: JOB_B, claimedNetPence: 250000, outstandingNetPence: 250000 })]));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£2,500.00");
    reads()[0]!.json(answerBody([caseView({ id: CASE_A, jobId: JOB_A })]));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£2,500.00");
  });

  it("shows nothing from the previous job while the next job is being read", async () => {
    const w = start(JOB_A);
    await w.settle();
    reads()[0]!.json(answerBody([caseView()]));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    w.rerender(JOB_B);
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("");
    expect(w.screen().text()).toContain("Loading recovery cases");
  });
});

describe("M4-1-S-R repair 12, Sol P3-5: a malformed answer shows the failure state and never throws", () => {
  const goodRegister = answerBody([caseView()]);
  const malformedReads: Array<[string, (call: Call) => void]> = [
    ["cases is null", call => call.json({ ...goodRegister, cases: null })],
    ["cases is missing", call => call.json({ version: "recovery-case-workbench.v1", environment: "synthetic_demo", realExternalActions: 0 })],
    ["the body is null", call => call.json(null)],
    ["the body is an array", call => call.json([])],
    ["the version is wrong", call => call.json({ ...goodRegister, version: "recovery-case-workbench.v2" })],
    ["a case is missing its fields", call => call.json(answerBody([{ id: CASE_A }]))],
    ["a case has a nonsense state", call => call.json(answerBody([caseView({ state: "teleported" })]))],
    ["an amount is not a whole number of pence", call => call.json(answerBody([caseView({ claimedNetPence: "320" })]))],
    ["the body is not JSON", call => call.raw()],
  ];
  it.each(malformedReads)("a read whose answer is malformed (%s) is announced as a failed load, with a retry, and nothing stale on screen", async (_name, deliver) => {
    const w = start();
    await w.settle();
    deliver(reads()[0]!);
    await w.settle();
    expect(w.screen().alert()).toContain("could not be loaded");
    expect(w.screen().hasButton("Try again")).toBe(true);
    expect(w.screen().text()).not.toContain("No recovery cases yet");
    expect(w.screen().testId("case-claimed-net")).toBe("");
    // The retry recovers once the server answers properly.
    w.click("Try again");
    await w.settle();
    expect(w.screen().text()).toContain("Loading recovery cases");
    reads()[1]!.json(goodRegister);
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    expect(w.screen().alert()).toBe("");
  });

  async function readyWithCase(state = "identified") {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([caseView({ state })]));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    return w;
  }
  const malformedWrites: Array<[string, (call: Call) => void]> = [
    ["cases is null", call => call.json({ version: "recovery-case-workbench.v1", environment: "synthetic_demo", realExternalActions: 0, cases: null })],
    ["the body is an empty object", call => call.json({})],
    ["the body is null", call => call.json(null)],
    ["the affected case id is not an id", call => call.json(answerBody([caseView()], "not-an-id"))],
    ["a case has a nonsense state", call => call.json(answerBody([caseView({ state: "teleported" })], CASE_A))],
    ["the body is not JSON", call => call.raw()],
  ];
  it.each(malformedWrites)("a command whose successful answer is malformed (%s) is announced, hides the register it can no longer vouch for, and can be sent again unchanged", async (_name, deliver) => {
    const w = await readyWithCase();
    w.click("Evidence assembled");
    await w.settle();
    expect(writes()).toHaveLength(1);
    deliver(writes()[0]!);
    await w.settle();
    expect(w.screen().alert()).toContain("could not be read");
    expect(w.screen().alert()).toContain("may or may not have been saved");
    expect(w.screen().testId("case-claimed-net")).toBe("");
    expect(w.screen().text()).not.toContain("No recovery cases yet");
    // Repair 13 (Sol P2-2): the outcome is unknown, so a re-read cannot settle it. The way on is the very same request again; the server then answers with what it already holds.
    w.click("Try again");
    await w.settle();
    expect(reads()).toHaveLength(1);
    expect(writes()).toHaveLength(2);
    expect(writes()[1]!.body).toEqual(writes()[0]!.body);
    writes()[1]!.json(answerBody([caseView({ state: "evidence_assembled", revision: 2 })], CASE_A));
    await w.settle();
    expect(w.screen().testId("case-state")).toBe("Evidence assembled");
    expect(w.screen().alert()).toBe("");
  });

  it("repair 16: a 4xx with no readable body announces uncertainty, hides the register, and replays the held request", async () => {
    const w = await readyWithCase();
    w.click("Evidence assembled");
    await w.settle();
    writes()[0]!.json(null, 400);
    await w.settle();
    expect(w.screen().alert()).toContain("may or may not have been saved");
    expect(w.screen().alert()).not.toContain("SyntaxError");
    expect(w.screen().testId("case-claimed-net")).toBe("");
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(true);
    w.click("Try again");
    await w.settle();
    expect(writes()[1]!.body).toEqual(writes()[0]!.body);
    expect(writes()[1]!.url).toBe(writes()[0]!.url);
    writes()[1]!.raw(404);
    await w.settle();
    expect(w.screen().alert()).toContain("may or may not have been saved");
    expect(w.screen().alert()).not.toContain("SyntaxError");
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(true);
    w.click("Try again"); await w.settle();
    expect(writes()[2]!.body).toEqual(writes()[0]!.body);
    writes()[2]!.json(answerBody([caseView({ state: "evidence_assembled", revision: 2 })], CASE_A)); await w.settle();
    expect(w.screen().testId("case-state")).toBe("Evidence assembled");
    expect(w.screen().alert()).toBe("");
  });

  it("still words a known refusal plainly and keeps the register on screen", async () => {
    const w = await readyWithCase();
    w.click("Evidence assembled");
    await w.settle();
    writes()[0]!.json({ code: "RECOVERY_STALE_REVISION" }, 409);
    await w.settle();
    expect(w.screen().alert()).toContain("This case changed since it was loaded");
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
  });

  it("accepts a well-formed command answer and selects the case the command affected", async () => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([caseView({ id: CASE_B, jobId: JOB_A, claimedNetPence: 250000, outstandingNetPence: 250000 })]));
    await w.settle();
    w.click("Open £320 withheld payment");
    await w.settle();
    writes()[0]!.json(answerBody([caseView({ id: CASE_B, claimedNetPence: 250000, outstandingNetPence: 250000 }), caseView()], CASE_A));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    expect(w.screen().alert()).toBe("");
  });
});

describe("M4-1-S-R repair 12, Sol P2-3 control: Record dispute is enabled only where the server allows a dispute", () => {
  it.each(STATES)("with the case %s", async state => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([caseView({ state })]));
    await w.settle();
    // The server refuses a dispute from a case that is only identified (nothing to dispute yet) and from a prevented one (the money was never paid).
    const refused = state === "identified" || state === "prevented";
    expect(w.screen().button("Record dispute").props.disabled).toBe(refused);
  });

  it("stays disabled while another command is in flight", async () => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([caseView({ state: "landed", landedNetPence: 32000, outstandingNetPence: 0 })]));
    await w.settle();
    expect(w.screen().button("Record dispute").props.disabled).toBe(false);
    w.click("Record dispute");
    await w.settle();
    expect(w.screen().button("Record dispute").props.disabled).toBe(true);
    expect(writes()[0]!.body).toMatchObject({ action: "transition", eventType: "dispute" });
  });
});

describe("M4-1-S-R repair 12, Sol P3-5: a malformed answer to a lookup made before a command is announced plainly and sends nothing", () => {
  const customers = "Recorded customer invoices could not be loaded", suppliers = "Recorded supplier sources could not be loaded";
  const cases: Array<[string, string, string, Lookup, string]> = [
    ["customer invoices is an empty object", "Open £320 withheld payment", "customer-invoices", { status: 200, body: {} }, customers],
    ["customer invoices is null", "Open £2,500 withheld payment", "customer-invoices", { status: 200, body: null }, customers],
    ["customer invoices is not JSON", "Record prevention", "customer-invoices", { status: 200, body: undefined, notJson: true }, customers],
    ["customer invoices is not a list", "Open £320 withheld payment", "customer-invoices", { status: 200, body: { invoices: "none" } }, customers],
    ["materials is an empty object", "Open materials-320 overcharge", "materials", { status: 200, body: {} }, suppliers],
    ["materials is null", "Open materials-320 overcharge", "materials", { status: 200, body: null }, suppliers],
    ["supplier documents has no facts", "Open materials-320 overcharge", "supplier-documents", { status: 200, body: { state: {} } }, suppliers],
    ["supplier documents is not JSON", "Open materials-320 overcharge", "supplier-documents", { status: 200, body: undefined, notJson: true }, suppliers],
  ];
  it.each(cases)("%s", async (_name, press, lookup, answer, message) => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([]));
    await w.settle();
    lookups[lookup] = answer;
    w.click(press);
    await w.settle();
    expect(w.screen().alert()).toBe(message);
    expect(writes()).toHaveLength(0);
    // Nothing is left locked and the register is still the one that was read.
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
    expect(w.screen().text()).toContain("No recovery cases yet");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Repair 13 (Sol round 13). Every test below drives the real component, exactly as above.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

describe("M4-1-S-R repair 13, Sol P2-1: a source lookup that outlives its job can send nothing and change nothing", () => {
  // Each practice button, with the lookups it makes before it sends anything.
  const presses: Array<[string, string]> = [["a £320 customer claim", "Open £320 withheld payment"], ["a £2,500 customer claim", "Open £2,500 withheld payment"], ["a prevention", "Record prevention"], ["a materials overcharge", "Open materials-320 overcharge"]];
  const job2500 = () => answerBody([caseView({ id: CASE_B, jobId: JOB_B, claimedNetPence: 250000, outstandingNetPence: 250000 })]);

  it.each(presses)("the job changes while the lookup for %s is still out: nothing is sent and job B's register is untouched", async (_name, press) => {
    const w = start(JOB_A);
    await w.settle();
    reads()[0]!.json(answerBody([]));
    await w.settle();
    const gate = holdLookups();
    w.click(press);
    await w.settle();
    expect(lookupRequests.length).toBeGreaterThan(0);
    expect(writes()).toHaveLength(0);
    w.rerender(JOB_B);
    await w.settle();
    reads()[1]!.json(job2500());
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£2,500.00");
    // Job A's lookup finishes only now. It belongs to a job that is no longer on screen, so it must not become a command for the job that is.
    gate.release();
    await w.settle();
    expect(writes()).toHaveLength(0);
    expect(w.screen().testId("case-claimed-net")).toBe("£2,500.00");
    expect(w.screen().alert()).toBe("");
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
  });

  it.each(presses)("the workbench is removed while the lookup for %s is still out: nothing is sent", async (_name, press) => {
    const w = start(JOB_A);
    await w.settle();
    reads()[0]!.json(answerBody([]));
    await w.settle();
    const gate = holdLookups();
    w.click(press);
    await w.settle();
    w.unmount();
    gate.release();
    await w.settle();
    expect(writes()).toHaveLength(0);
  });

  it("a lookup for the previous job that finishes malformed or refused is not announced on the next job", async () => {
    const w = start(JOB_A);
    await w.settle();
    reads()[0]!.json(answerBody([]));
    await w.settle();
    lookups["customer-invoices"] = { status: 500, body: null };
    const gate = holdLookups();
    w.click("Open £320 withheld payment");
    await w.settle();
    w.rerender(JOB_B);
    await w.settle();
    reads()[1]!.json(job2500());
    await w.settle();
    gate.release();
    await w.settle();
    expect(w.screen().alert()).toBe("");
    expect(w.screen().testId("case-claimed-net")).toBe("£2,500.00");
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
  });

  it("a job change after the lookups, while the command is on its way, still drops the command's answer (the ticket is the one taken before the lookups)", async () => {
    const w = start(JOB_A);
    await w.settle();
    reads()[0]!.json(answerBody([]));
    await w.settle();
    w.click("Open £320 withheld payment");
    await w.settle();
    expect(writes()).toHaveLength(1);
    w.rerender(JOB_B);
    await w.settle();
    reads()[1]!.json(job2500());
    await w.settle();
    writes()[0]!.json(answerBody([caseView()], CASE_A));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£2,500.00");
  });
});

describe("M4-1-S-R repair 13, Sol P2-2: an unknown save outcome never permits a duplicate opening", () => {
  const MAY = "may or may not have been saved";
  // The server's replay contract, in miniature: a command id that has already been committed returns the case it created, whatever the browser did or did not hear.
  function fakeServer() {
    const byCommand = new Map<string, string>(), cases: Array<ReturnType<typeof caseView>> = [];
    const commit = (body: { commandId: string; claimedNetPence?: number }) => {
      if (!byCommand.has(body.commandId)) { const id = crypto.randomUUID(); cases.push(caseView({ id, claimedNetPence: body.claimedNetPence ?? 32000, outstandingNetPence: body.claimedNetPence ?? 32000 })); byCommand.set(body.commandId, id) }
      return byCommand.get(body.commandId)!;
    };
    return { cases, commit, answer: (call: Call) => { const id = commit(call.body as { commandId: string; claimedNetPence?: number }); call.json(answerBody(cases, id)) } };
  }
  const commandIdOf = (call: Call) => (call.body as { commandId: string }).commandId;
  async function ready() {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([]));
    await w.settle();
    return w;
  }

  // What the browser can fail to learn. In every one of these the server may have committed the command.
  const unknown: Array<[string, (call: Call) => void]> = [
    ["the connection is lost (no answer at all)", call => call.reject()],
    ["a 200 whose body is not JSON", call => call.raw(200)],
    ["a 502 from a gateway, with a page instead of JSON", call => call.raw(502)],
    ["an empty 408 after the POST committed (repair 16)", call => call.raw(408)],
    ["an unreadable 404 intermediary page (repair 16)", call => call.raw(404)],
    ["an unrecognised 400 code (repair 16)", call => call.json({ code: "Receipt is not allowed" }, 400)],
    ["a 500 with no body", call => call.json(null, 500)],
    ["a 500 whose body is the framework's own", call => call.json({ statusCode: 500, message: "Internal server error" }, 500)],
    ["a 200 that is not the response contract", call => call.json({ ok: true })],
    ["a 200 with the cases but no affected case id", call => call.json(answerBody([caseView({ id: CASE_B, claimedNetPence: 250000, outstandingNetPence: 250000 })]))],
    ["a 200 whose affected case id is not in the list", call => call.json(answerBody([caseView({ id: CASE_B, claimedNetPence: 250000, outstandingNetPence: 250000 })], CASE_A))],
  ];

  it.each(unknown)("opening a case when %s: announced, every way of opening is off, and the only retry re-sends the same command id and creates exactly one case", async (_name, lose) => {
    const server = fakeServer();
    const w = await ready();
    w.click("Open £320 withheld payment");
    await w.settle();
    expect(writes()).toHaveLength(1);
    const first = writes()[0]!;
    // The server commits, then the browser fails to hear (or understand) the answer.
    server.commit(first.body as { commandId: string; claimedNetPence: number });
    lose(first);
    await w.settle();
    expect(w.screen().alert()).toContain(MAY);
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(true);
    // Even a press that gets past the disabled button (as the pre-repair page allowed) starts no new opening: no lookup, no command.
    const lookupsBefore = lookupRequests.length;
    for (const name of OPEN_BUTTONS) w.forceClick(name);
    await w.settle();
    expect(writes()).toHaveLength(1);
    expect(lookupRequests).toHaveLength(lookupsBefore);
    // The one way on is "Try again", and it re-sends exactly what was sent.
    expect(w.screen().button("Try again").props.disabled).toBe(false);
    w.click("Try again");
    await w.settle();
    expect(writes()).toHaveLength(2);
    expect(writes()[1]!.body).toEqual(first.body);
    expect(writes()[1]!.url).toBe(first.url);
    expect(commandIdOf(writes()[1]!)).toBe(commandIdOf(first));
    server.answer(writes()[1]!);
    await w.settle();
    expect(server.cases).toHaveLength(1);
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    expect(w.screen().alert()).toBe("");
    expect(reads()).toHaveLength(1);
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
  });

  it("lost POST, retry lost again, retry again: all three requests carry the identical command id, and the register ends with one case", async () => {
    const server = fakeServer();
    const w = await ready();
    w.click("Open £320 withheld payment");
    await w.settle();
    server.commit(writes()[0]!.body as { commandId: string });
    writes()[0]!.reject();
    await w.settle();
    w.click("Try again");
    await w.settle();
    writes()[1]!.reject();
    await w.settle();
    expect(w.screen().alert()).toContain(MAY);
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(true);
    w.click("Try again");
    await w.settle();
    expect(writes()).toHaveLength(3);
    server.answer(writes()[2]!);
    await w.settle();
    expect(new Set(writes().map(commandIdOf)).size).toBe(1);
    expect(server.cases).toHaveLength(1);
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
  });

  it("the uncertainty is announced and focused, with the register it can no longer vouch for hidden", async () => {
    const w = await ready();
    w.click("Open £320 withheld payment");
    await w.settle();
    writes()[0]!.reject();
    await w.settle();
    expect(w.screen().alert()).toContain(MAY);
    expect(w.screen().alert()).not.toContain("Failed to fetch");
    expect(w.screen().text()).not.toContain("No recovery cases yet");
    expect(w.screen().testId("case-claimed-net")).toBe("");
  });

  it("an unknown outcome on a command for an existing case is held the same way: the same command id and revision are re-sent, and nothing else can be sent meanwhile", async () => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([caseView()]));
    await w.settle();
    w.click("Evidence assembled");
    await w.settle();
    const first = writes()[0]!;
    first.reject();
    await w.settle();
    expect(w.screen().alert()).toContain(MAY);
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(true);
    w.click("Try again");
    await w.settle();
    expect(writes()[1]!.body).toEqual(first.body);
    writes()[1]!.json(answerBody([caseView({ state: "evidence_assembled", revision: 2 })], CASE_A));
    await w.settle();
    expect(w.screen().testId("case-state")).toBe("Evidence assembled");
    expect(w.screen().alert()).toBe("");
  });

  const refusals: Array<[string, (call: Call) => void]> = [
    ["a 409 stale revision", call => call.json({ code: "RECOVERY_STALE_REVISION" }, 409)],
    ["a 400 naming the forbidden transition", call => call.json({ code: "RECOVERY_TRANSITION_FORBIDDEN", message: "record_landing is not allowed from identified" }, 400)],
    ["a 403", call => call.json({ code: "RECOVERY_REVIEWER_FORBIDDEN" }, 403)],
    ["a 404 naming the missing case", call => call.json({ code: "RECOVERY_CASE_NOT_FOUND" }, 404)],
  ];
  it.each(refusals)("%s is an explicit refusal: nothing was saved, so the user may start a new opening, with a new command id", async (_name, refuse) => {
    const w = await ready();
    w.click("Open £320 withheld payment");
    await w.settle();
    const first = writes()[0]!;
    refuse(first);
    await w.settle();
    expect(w.screen().alert()).not.toBe("");
    expect(w.screen().alert()).not.toContain(MAY);
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
    w.click("Open £320 withheld payment");
    await w.settle();
    expect(writes()).toHaveLength(2);
    expect(commandIdOf(writes()[1]!)).not.toBe(commandIdOf(first));
  });

  it("when the re-sent request is itself refused, that is the definitive answer: the refusal is shown, the hold is released, and the register can be re-read", async () => {
    const w = await ready();
    w.click("Open £320 withheld payment");
    await w.settle();
    writes()[0]!.reject();
    await w.settle();
    w.click("Try again");
    await w.settle();
    writes()[1]!.json({ code: "IDEMPOTENCY_PAYLOAD_CONFLICT" }, 409);
    await w.settle();
    expect(w.screen().alert()).toBe("IDEMPOTENCY_PAYLOAD_CONFLICT");
    expect(w.screen().alert()).not.toContain(MAY);
    w.click("Try again");
    await w.settle();
    expect(reads()).toHaveLength(2);
    reads()[1]!.json(answerBody([]));
    await w.settle();
    expect(w.screen().text()).toContain("No recovery cases yet");
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
  });

  it.each([
    ["RECOVERY_STALE_REVISION", 409], ["RECOVERY_CASE_NOT_FOUND", 404], ["RECOVERY_JOB_NOT_FOUND", 404],
    ["RECOVERY_TRANSITION_FORBIDDEN", 400], ["RECOVERY_SOURCE_NOT_RECOGNISED", 400], ["RECOVERY_CLAIM_BELOW_SETTLED", 400],
    ["ELIGIBILITY_REVIEW_NOT_FOUND", 404], ["ELIGIBILITY_STALE_REVISION", 409],
  ] as const)("repair 17: a reversible post-replay refusal %s/%i retains the original attempt and blocks new commands", async (code, status) => {
    const w = await ready();
    w.click("Open £320 withheld payment"); await w.settle();
    const first = writes()[0]!;
    first.reject(); await w.settle();
    w.click("Try again"); await w.settle();
    expect(writes()[1]!.body).toEqual(first.body);
    expect(writes()[1]!.url).toBe(first.url);
    writes()[1]!.json({ code }, status); await w.settle();
    expect(w.screen().alert()).not.toBe("");
    expect(w.screen().alert()).toContain(MAY);
    for (const name of OPEN_BUTTONS) {
      expect(w.screen().button(name).props.disabled, name).toBe(true);
      w.forceClick(name);
    }
    await w.settle(); expect(writes()).toHaveLength(2);
    w.click("Try again"); await w.settle();
    expect(reads()).toHaveLength(1);
    expect(writes()).toHaveLength(3);
    expect(writes()[2]!.body).toEqual(first.body);
    expect(writes()[2]!.url).toBe(first.url);
    writes()[2]!.json(answerBody([caseView()], CASE_A)); await w.settle();
    expect(w.screen().alert()).toBe("");
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
  });

  it("moving to another job abandons the held request: job B starts clean and nothing is ever re-sent for job A", async () => {
    const w = await ready();
    w.click("Open £320 withheld payment");
    await w.settle();
    writes()[0]!.reject();
    await w.settle();
    expect(w.screen().alert()).toContain(MAY);
    w.rerender(JOB_B);
    await w.settle();
    reads()[1]!.json(answerBody([]));
    await w.settle();
    expect(w.screen().alert()).toBe("");
    expect(w.screen().hasButton("Try again")).toBe(false);
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
    expect(writes()).toHaveLength(1);
  });

  it("an answer that arrives for an abandoned attempt neither holds nor shows anything on the next job", async () => {
    const w = await ready();
    w.click("Open £320 withheld payment");
    await w.settle();
    w.rerender(JOB_B);
    await w.settle();
    reads()[1]!.json(answerBody([]));
    await w.settle();
    writes()[0]!.reject();
    await w.settle();
    expect(w.screen().alert()).toBe("");
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
  });
});

describe("M4-1-S-R repair 13, Sol P3-4: an opening answer that does not name a listed case is never turned into a selection", () => {
  const case2500 = () => caseView({ id: CASE_B, claimedNetPence: 250000, outstandingNetPence: 250000 });
  it("does not show another case when the answer to a £320 opening holds only the £2,500 case and no affected id", async () => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([case2500()]));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£2,500.00");
    w.click("Open £320 withheld payment");
    await w.settle();
    writes()[0]!.json(answerBody([case2500()]));
    await w.settle();
    // No £2,500 case on screen as if it were the one just opened, and no silent success.
    expect(w.screen().testId("case-claimed-net")).toBe("");
    expect(w.screen().alert()).toContain("may or may not have been saved");
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(true);
  });

  it("does not show another case when the affected id is well-formed but not in the returned list", async () => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([]));
    await w.settle();
    w.click("Open £320 withheld payment");
    await w.settle();
    writes()[0]!.json(answerBody([case2500()], CASE_A));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("");
    expect(w.screen().alert()).toContain("may or may not have been saved");
  });

  it("holds every kind of command to the same rule, not only openings", async () => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([caseView()]));
    await w.settle();
    w.click("Evidence assembled");
    await w.settle();
    writes()[0]!.json(answerBody([caseView({ state: "evidence_assembled", revision: 2 })]));
    await w.settle();
    expect(w.screen().alert()).toContain("may or may not have been saved");
    expect(w.screen().testId("case-state")).toBe("");
  });

  it("a plain read still needs no affected id", async () => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([caseView()]));
    await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    expect(w.screen().alert()).toBe("");
  });
});

describe("M4-1-S-R repair 13, Sol P3-3: every row of a source lookup is checked before any of it is used", () => {
  const RATE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", VERSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", DOC = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", INVOICE_1 = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1", INVOICE_2 = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";
  const goodMaterial = { id: "m1", rateId: RATE, quantity: "40", eachPence: 2000, status: "applicable" };
  const goodFact = { document_id: DOC, document_number: "INV-M320-001", version_id: VERSION, document_type: "invoice" };
  const suppliers = "Recorded supplier sources could not be loaded", customers = "Recorded customer invoices could not be loaded";
  type Bad = [string, string, string, unknown, string];
  const bad: Bad[] = [
    ["materials: a null row", "Open materials-320 overcharge", "materials", { materials: [null] }, suppliers],
    ["materials: a row that is a number", "Open materials-320 overcharge", "materials", { materials: [42] }, suppliers],
    ["materials: a row with no quantity", "Open materials-320 overcharge", "materials", { materials: [{ rateId: RATE, eachPence: 2000 }] }, suppliers],
    ["materials: a quantity that is a number", "Open materials-320 overcharge", "materials", { materials: [{ rateId: RATE, quantity: 40, eachPence: 2000 }] }, suppliers],
    ["materials: a rate id that is not an id", "Open materials-320 overcharge", "materials", { materials: [{ rateId: 7, quantity: "40", eachPence: 2000 }] }, suppliers],
    ["materials: a price that is text", "Open materials-320 overcharge", "materials", { materials: [{ rateId: RATE, quantity: "40", eachPence: "2000" }] }, suppliers],
    ["materials: one good row and one null row", "Open materials-320 overcharge", "materials", { materials: [goodMaterial, null] }, suppliers],
    ["supplier facts: a null row", "Open materials-320 overcharge", "supplier-documents", { state: { facts: [null] } }, suppliers],
    ["supplier facts: an empty row", "Open materials-320 overcharge", "supplier-documents", { state: { facts: [{}] } }, suppliers],
    ["supplier facts: a row with no version id", "Open materials-320 overcharge", "supplier-documents", { state: { facts: [{ document_id: DOC, document_number: "INV-M320-001" }] } }, suppliers],
    ["supplier facts: a version id that is a number", "Open materials-320 overcharge", "supplier-documents", { state: { facts: [{ ...goodFact, version_id: 7 }] } }, suppliers],
    ["supplier facts: one good row and one null row", "Open materials-320 overcharge", "supplier-documents", { state: { facts: [goodFact, null] } }, suppliers],
    ["customer invoices: a null row", "Open £320 withheld payment", "customer-invoices", { invoices: [null] }, customers],
    ["customer invoices: an empty row", "Open £2,500 withheld payment", "customer-invoices", { invoices: [{}] }, customers],
    ["customer invoices: an empty id", "Record prevention", "customer-invoices", { invoices: [{ id: "" }] }, customers],
    ["customer invoices: an id that is a number", "Open £320 withheld payment", "customer-invoices", { invoices: [{ id: 5 }] }, customers],
    ["customer invoices: an id that is not an id", "Open £320 withheld payment", "customer-invoices", { invoices: [{ id: "x" }] }, customers],
    ["customer invoices: one good row and one null row", "Open £2,500 withheld payment", "customer-invoices", { invoices: [{ id: INVOICE_1 }, null] }, customers],
  ];
  it.each(bad)("%s shows the plain lookup failure and sends nothing", async (_name, press, lookup, body, message) => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([]));
    await w.settle();
    lookups[lookup] = { status: 200, body };
    w.click(press);
    await w.settle();
    expect(w.screen().alert()).toBe(message);
    expect(writes()).toHaveLength(0);
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
    expect(w.screen().text()).toContain("No recovery cases yet");
  });

  it("well-formed rows are used as before: the newest invoice for a customer claim, the matching rate and invoice version for the materials claim", async () => {
    const w = start();
    await w.settle();
    reads()[0]!.json(answerBody([]));
    await w.settle();
    lookups["customer-invoices"] = { status: 200, body: { invoices: [{ id: INVOICE_1, number: "A" }, { id: INVOICE_2, number: "B" }] } };
    w.click("Open £320 withheld payment");
    await w.settle();
    expect((writes()[0]!.body as { sourceRefs: string[] }).sourceRefs).toEqual([INVOICE_2]);
    writes()[0]!.json(answerBody([caseView()], CASE_A));
    await w.settle();
    lookups.materials = { status: 200, body: { materials: [goodMaterial, { id: "m2", rateId: null, quantity: "10", status: "review" }] } };
    lookups["supplier-documents"] = { status: 200, body: { state: { facts: [goodFact, { ...goodFact, document_number: "INV-OTHER", version_id: DOC }] } } };
    w.click("Open materials-320 overcharge");
    await w.settle();
    expect((writes()[1]!.body as { sourceRefs: string[] }).sourceRefs).toEqual([RATE, VERSION]);
  });
});

describe("M4-1-S-R repair 14: the two-step stale approval belongs to one ticket", () => {
 const eligibility = { revision: 1, caseRevision: 1, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1, classification: "eligible_for_review", eligibleNetPence: 32000, reason: "Fictional evidence", citations: ["Generated customer invoice INV-18800"], status: "reviewed", reviewerRef: "membership:fictional" };
 async function begin() {
  const w = start(); await w.settle();
  reads()[0]!.json(answerBody([caseView({ eligibility })])); await w.settle();
  w.click("Test stale approval after evidence changes"); await w.settle();
  expect(writes()).toHaveLength(1);
  expect(writes()[0]!.body).toMatchObject({ action: "supersede", caseId: CASE_A });
  return w;
 }
 it.each(["job switch", "unmount"])("stops before step two after %s while step one is pending", async abandon => {
  const w = await begin();
  if (abandon === "job switch") { w.rerender(JOB_B); await w.settle(); reads()[1]!.json(answerBody([])); await w.settle(); } else w.unmount();
  const before = w.screen().text();
  writes()[0]!.json(answerBody([caseView({ eligibility: { ...eligibility, status: "superseded", evidenceRevision: 2 } })], CASE_A));
  await w.settle();
  expect(writes()).toHaveLength(1);
  expect(w.screen().text()).toBe(before);
  expect(w.screen().alert()).toBe("");
  if (abandon === "job switch") { expect(w.screen().text()).toContain("No recovery cases yet"); expect(w.screen().testId("case-claimed-net")).toBe(""); }
 });
 it("a refused first step never sends step two or replaces its error", async () => {
  const w = await begin();
  writes()[0]!.json({ code: "ELIGIBILITY_STALE_REVISION", message: "Review the changed evidence before approving" }, 409);
  await w.settle();
  expect(writes()).toHaveLength(1);
  expect(w.screen().alert()).toBe("Review the changed evidence before approving");
 });
 it("an unknown first step stays held without sending step two", async () => {
  const w = await begin(); writes()[0]!.reject(); await w.settle();
  expect(writes()).toHaveLength(1);
  expect(w.screen().alert()).toContain("may or may not have been saved");
 });
 it("sends the deliberate stale approval only after confirmed supersession on the same job", async () => {
  const w = await begin();
  writes()[0]!.json(answerBody([caseView({ eligibility: { ...eligibility, status: "superseded", evidenceRevision: 2 } })], CASE_A));
  await w.settle();
  expect(writes()).toHaveLength(2);
  expect(writes()[1]!.body).toMatchObject({ action: "approve", caseId: CASE_A, expectedEvidenceRevision: 1 });
  writes()[1]!.json({ code: "ELIGIBILITY_STALE_REVISION" }, 409); await w.settle();
  expect(w.screen().alert()).toBe("ELIGIBILITY_STALE_REVISION");
 });
});

// Repair 15: membership checks precede replay, so a refused retry cannot decide an earlier lost answer.
describe("repair 15: an authorisation refusal leaves the original unknown attempt held", () => {
  it.each([["UNAUTHENTICATED", 401], ["RECOVERY_REVIEWER_FORBIDDEN", 403], ["MEMBERSHIP_FORBIDDEN", 403], ["JOB_NOT_FOUND", 404]] as const)("lost committed opening, retry refused with %s/%i, then authorised replay uses the original id", async (code, status) => {
    const w = start();
    await w.settle(); reads()[0]!.json(answerBody([])); await w.settle();
    w.click("Open £320 withheld payment"); await w.settle();
    const original = writes()[0]!;
    const committed = answerBody([caseView()], CASE_A);
    original.reject(); await w.settle();
    w.click("Try again"); await w.settle();
    expect(writes()[1]!.body).toEqual(original.body);
    writes()[1]!.json({ code }, status); await w.settle();
    expect(w.screen().alert()).toContain("may or may not have been saved");
    expect(w.screen().alert()).toContain(code);
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(true);
    w.forceClick("Open £320 withheld payment"); await w.settle();
    expect(writes()).toHaveLength(2);
    w.click("Try again"); await w.settle();
    expect(writes()[2]!.body).toEqual(original.body);
    writes()[2]!.json(committed); await w.settle();
    expect(reads()).toHaveLength(1);
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    expect(w.screen().alert()).toBe("");
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(false);
  });
  it.each([-1, 1_000_000_000_001, 2 ** 53])("invalid principal %s fails loading and leaves a command answer unknown", async amount => {
    const w = start(); await w.settle();
    reads()[0]!.json(answerBody([caseView({ approvedLandedNetPence: amount })])); await w.settle();
    expect(w.screen().alert()).toContain("could not be loaded");
    expect(w.screen().testId("case-claimed-net")).toBe("");
    w.click("Try again"); await w.settle(); reads()[1]!.json(answerBody([])); await w.settle();
    w.click("Open £320 withheld payment"); await w.settle();
    const first = writes()[0]!;
    first.json(answerBody([caseView({ approvedLandedNetPence: amount })], CASE_A)); await w.settle();
    expect(w.screen().alert()).toContain("may or may not have been saved");
    for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled, name).toBe(true);
    w.click("Try again"); await w.settle(); expect(writes()[1]!.body).toEqual(first.body);
    writes()[1]!.json(answerBody([caseView()], CASE_A)); await w.settle();
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
  });
});


describe("repair 17: a refusal is not a durable result for a delayed original", () => {
 const MAY = "may or may not have been saved";
 it("delayed £900 amendment, refused retry, approved reversal and late original stay unknown until identical replay confirms the save", async () => {
  // The adapter models an original waiting before the transaction; its lost response cannot cancel execution.
  const originalCase = caseView({claimedNetPence:250000,landedNetPence:0,outstandingNetPence:250000,state:"evidence_assembled",revision:3});
  let persisted = originalCase;
  const w = start(); await w.settle(); reads()[0]!.json(answerBody([persisted])); await w.settle();
  const label = [...walk(w.inst.tree)].find(el => el.type === "label" && textOf(el).startsWith("New claimed amount (£)"))!;
  const input = [...walk(label)].find(el => el.type === "input")!;
  (input.props.onChange as (e:{target:{value:string}})=>void)({target:{value:"900.00"}}); await w.settle();
  w.click("Amend claim"); await w.settle(); const first = writes()[0]!;
  expect(first.body).toMatchObject({action:"amend_claim",caseId:CASE_A,claimedNetPence:90000,expectedRevision:3});
  const executeDelayedOriginal = () => {persisted = {...persisted,claimedNetPence:90000,outstandingNetPence:90000,revision:5}};
  first.reject(); await w.settle();
  persisted = {...persisted,approvedLandedNetPence:100000,landedNetPence:100000,outstandingNetPence:150000};
  w.click("Try again"); await w.settle();
  expect(writes()[1]!.body).toEqual(first.body);
  writes()[1]!.json({code:"RECOVERY_CLAIM_BELOW_SETTLED"},400); await w.settle();
  expect(w.screen().alert()).toContain(MAY);
  for (const name of OPEN_BUTTONS) {expect(w.screen().button(name).props.disabled,name).toBe(true);w.forceClick(name)}
  await w.settle(); expect(writes()).toHaveLength(2);
  // An approved reversal changes money but not revision, so the delayed identical request can execute.
  persisted = {...persisted,approvedLandedNetPence:0,landedNetPence:0,outstandingNetPence:250000};
  expect(persisted.revision).toBe(3); executeDelayedOriginal();
  expect(w.screen().alert()).toContain(MAY);
  w.click("Try again"); await w.settle();
  expect(reads()).toHaveLength(1); expect(writes()).toHaveLength(3);
  expect(writes()[2]!.body).toEqual(first.body); expect(writes()[2]!.url).toBe(first.url);
  writes()[2]!.json(answerBody([persisted],CASE_A)); await w.settle();
  expect(w.screen().alert()).toBe(""); expect(w.screen().testId("case-claimed-net")).toBe("£900.00");
  for (const name of OPEN_BUTTONS) expect(w.screen().button(name).props.disabled,name).toBe(false);
 });
});
