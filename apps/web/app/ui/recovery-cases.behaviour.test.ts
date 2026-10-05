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
  type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: unknown; ref?: { current: unknown }; set?: (next: unknown) => void };
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
const reads = () => calls.filter(call => call.method === "GET");
const writes = () => calls.filter(call => call.method === "POST");

afterEach(() => { vi.unstubAllGlobals() });

beforeAll(() => {
  // The web tsconfig keeps JSX as "preserve" for Next, so vitest compiles it with the classic runtime and the component needs a global React at render time.
  (globalThis as { React?: typeof React }).React = React;
});

function start(jobId = JOB_A) {
  calls = [];
  vi.stubGlobal("fetch", (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input), method = init?.method ?? "GET";
    // The practice buttons look up the job's recorded customer invoices first; none are recorded, so the fixed fictional label is used.
    if (url.endsWith("/customer-invoices")) return Promise.resolve(respond({ invoices: [] }, 200));
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
  it.each(malformedWrites)("a command whose successful answer is malformed (%s) is announced, hides the register it can no longer vouch for, and can be re-read", async (_name, deliver) => {
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
    // Not left locked: the user can re-read the register and carry on.
    w.click("Try again");
    await w.settle();
    reads()[1]!.json(answerBody([caseView({ state: "evidence_assembled", revision: 2 })]));
    await w.settle();
    expect(w.screen().testId("case-state")).toBe("Evidence assembled");
    expect(w.screen().alert()).toBe("");
  });

  it("a refusal with no readable body is announced in plain words, not as a JavaScript error", async () => {
    const w = await readyWithCase();
    w.click("Evidence assembled");
    await w.settle();
    writes()[0]!.json(null, 500);
    await w.settle();
    expect(w.screen().alert()).toBe("Recovery case could not be saved");
    // The register read before the refusal is still the current one.
    expect(w.screen().testId("case-claimed-net")).toBe("£320.00");
    w.click("Evidence assembled");
    await w.settle();
    writes()[1]!.raw(502);
    await w.settle();
    expect(w.screen().alert()).toBe("Recovery case could not be saved");
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
