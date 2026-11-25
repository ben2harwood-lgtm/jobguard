import * as React from "react";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { QuoteEditor } from "./quote-editor";
import type { PendingAcceptance, QuoteAcceptanceRead } from "./quote-acceptance-read";

const hooks = vi.hoisted(() => {
  let cursor = 0, writes = 0;
  const slots: any[] = [], effects: (() => void)[] = [];
  const unmount = () => {
    for (const slot of slots) if (slot?.cleanup) { const cleanup = slot.cleanup; slot.cleanup = undefined; cleanup(); }
    effects.length = 0;
  };
  return {
    unmount,
    reset() { unmount(); cursor = 0; writes = 0; slots.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    writes() { return writes; },
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value: any) => { writes++; slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn: () => unknown) { return fn(); },
    useEffect(fn: () => void | (() => void), deps: unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old || !deps.every((value, i) => Object.is(value, old.deps[i]))) {
        const effect = { deps, cleanup: undefined as void | (() => void) }; slots[index] = effect;
        effects.push(() => { old?.cleanup?.(); effect.cleanup = fn(); });
      }
    },
  };
});
vi.mock("react", async original => ({ ...await original<typeof React>(), useContext: () => 0, ...hooks }));
type Node = React.ReactElement<Record<string, any>>;
function elements(tree: React.ReactNode, inherited = false): { node: Node; disabled: boolean }[] {
  if (Array.isArray(tree)) return tree.flatMap(child => elements(child, inherited));
  if (!React.isValidElement<Record<string, any>>(tree)) return [];
  const disabled = inherited || !!tree.props.disabled;
  return [{ node: tree, disabled }, ...elements(tree.props.children, inherited || (tree.type === "fieldset" && disabled))];
}
function text(tree: React.ReactNode): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (React.isValidElement<Record<string, any>>(tree)) return text(tree.props.children);
  return typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}
function button(tree: React.ReactNode, name: string) { return elements(tree).find(({ node }) => node.type === "button" && text(node) === name)!; }
function click(tree: React.ReactNode, name: string) {
  const found = button(tree, name); expect(found, name).toBeDefined(); expect(found.disabled, name).toBe(false);
  found.node.props.onClick();
}
const jobId = "11111111-1111-4111-8111-111111111112", nextJob = "11111111-1111-4111-8111-111111111113";
const documentId = "21111111-1111-4111-8111-111111111112", bindingId = "31111111-1111-4111-8111-111111111112";
const scopeId = "41111111-1111-4111-8111-111111111112", lineId = "51111111-1111-4111-8111-111111111112";
const hash = "a".repeat(64), settle = () => new Promise<void>(resolve => setImmediate(resolve));
type Command = PendingAcceptance["command"];
const source = [{ id: lineId, scopeItemId: scopeId, description: "Paint fictional room", quantity: "1", unit: "job", rate: 100000, origin: "proposal" as const, status: "accepted", reason: "", category: "decorating" }];
const line = { id: lineId, scopeItemId: scopeId, scopeRevisionId: scopeId, description: source[0]!.description, origin: "captured", included: true, exclusionReason: null, quantity: "1", unit: "job", unitRatePence: 100000, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "decorating", region: null };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const empty = (id = jobId): QuoteAcceptanceRead => ({ version: 1, environment: "synthetic_demo", jobId: id, jobStatus: "quoting", jobRevision: 1, currentDocument: { id: documentId, version: 1, hash, netPence: 100000, totalPence: 120000 }, activeAcceptance: null, events: [], effects: { platformObligations: 0, settlements: 0, recoveryFees: 0 } });
let saved: Map<string, QuoteAcceptanceRead>, onCommitted: Mock<() => Promise<void>>;
let post: (command: Command, id: string) => Promise<Response>;
let read: (id: string) => Promise<Response>;
function commit(command: Command, id = jobId): QuoteAcceptanceRead {
  const view: QuoteAcceptanceRead = { ...empty(id), jobStatus: "accepted", jobRevision: 2,
    activeAcceptance: { id: crypto.randomUUID(), documentId: command.documentId, documentHash: command.documentHash, documentVersion: command.documentVersion, netPence: 100000, totalPence: 120000, actor: "Practice firm (builder)", acceptedAt: command.acceptedAt, method: command.statedMethod as "email", statedCustomerName: command.statedCustomerName.trim(), sourceEvidence: "No supporting evidence attached" },
    events: [{ id: crypto.randomUUID(), kind: "accepted", documentVersion: command.documentVersion, documentHash: command.documentHash, occurredAt: command.acceptedAt, actor: "Practice firm (builder)" }],
  };
  saved.set(id, view); return view;
}
const props = { jobId, source, questions: [], back() {}, practiceTools: null, proofStage: null, finalAccount: null };
function render(id = jobId, extra: Partial<React.ComponentProps<typeof QuoteEditor>> = {}) { hooks.render(); const tree = QuoteEditor({ ...props, jobId: id, onCommitted, ...extra }); hooks.effects(); return tree; }
const posts = () => vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).endsWith("/quotes/acceptance") && init?.method === "POST");
const mutations = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
const accepted = (tree: React.ReactNode) => elements(tree).some(({ node }) => node.props["aria-label"] === "Accepted terms");
async function prepare(id = jobId) {
  render(id); await settle();
  click(render(id), "Preview this quote"); await settle();
  expect(button(render(id), "Record practice acceptance").disabled).toBe(false);
}
beforeEach(() => {
  hooks.reset(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-19T13:00:00.000Z"));
  vi.stubGlobal("React", React); vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  saved = new Map([[jobId, empty()], [nextJob, empty(nextJob)]]); onCommitted = vi.fn(async () => undefined);
  post = async (command, id) => response(commit(command, id)); read = async id => response(saved.get(id));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const id = /^\/api\/jobs\/([^/]+)/u.exec(url)?.[1] ?? jobId;
    if (url.endsWith("/parties")) return response({ current: { customer: { name: "Practice Customer" } }, currentIds: { bindingId } });
    if (url.endsWith("/quotes")) return response({ version: 1, environment: "synthetic_demo", jobId: id, scope: [], draft: { id, revision: 1, currentRevisionId: id }, revisions: [{ id, revision: 1, previousRevisionId: null, netPence: 100000, taxPence: 20000, totalPence: 120000, issuable: true, blockers: [], lines: [line] }] });
    if (url.endsWith("/activation")) return response({ version: 1, environment: "synthetic_demo", jobId: id, jobStatus: "quoting", jobRevision: 1, activation: null, effects: { activations: 0, capSnapshots: 0, simulatedObligations: 0, settlements: 0, platformJournals: 0, realExternalActions: 0 } });
    if (url.endsWith("/preview")) return response({ view: { documentId, documentVersion: 1, contentHash: hash, status: "simulated_delivery" }, document: { documentVersion: 1, reference: "Q-TEST", jobParties: { bindingId }, customer: { name: "Practice Customer" }, issuer: { name: "Practice firm" } } });
    if (url.endsWith("/delivery")) return response({ documentId, documentVersion: 1, status: "simulated_delivery", acceptedDocumentReferences: {} });
    if (url.endsWith("/acceptance")) return init?.method === "POST" ? post(JSON.parse(init.body as string), id) : read(id);
    throw new Error(`Unexpected request ${url}`);
  }));
});
afterEach(() => { hooks.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("contains a lost committed reply, holds conflicting actions, and recovers saved acceptance with GET only", async () => {
  await prepare();
  post = async (command, id) => { commit(command, id); throw new Error("Lost committed reply"); };
  click(render(), "Record practice acceptance"); await settle();
  let tree = render();
  expect(text(tree)).toContain("may or may not have been saved"); expect(accepted(tree)).toBe(false);
  for (const name of ["Record practice acceptance", "Record customer decline", "Supersede quote", "Save draft revision"]) expect(button(tree, name).disabled, name).toBe(true);
  expect(button(tree, "Load the saved acceptance").disabled).toBe(false);
  click(tree, "Load the saved acceptance"); await settle(); tree = render();
  expect(accepted(tree)).toBe(true); expect(text(tree)).toContain("no new acceptance was sent");
  expect(text(tree)).not.toContain("result is unknown"); expect(posts()).toHaveLength(1);
  expect(onCommitted).toHaveBeenCalledTimes(1);
  // The rate box is a NumberField (TOMMY-DEMO); it shows its committed value through show().
  const rate = elements(tree).find(({ node }) => node.props.label === "Unit rate Paint fictional room")?.node.props;
  expect(rate?.show(rate.value)).toBe("1000.00");
});

it("keeps an empty authoritative read on hold and explicitly retries the identical command bytes", async () => {
  await prepare(); post = async () => { throw new Error("No response"); };
  click(render(), "Record practice acceptance"); await settle();
  const original = posts()[0]![1]!.body;
  click(render(), "Load the saved acceptance"); await settle();
  expect(text(render())).toContain("do not yet confirm"); expect(button(render(), "Record customer decline").disabled).toBe(true); expect(posts()).toHaveLength(1);
  vi.setSystemTime(new Date("2026-11-20T15:00:00.000Z"));
  post = async (command, id) => response(commit(command, id));
  click(render(), "Retry this same acceptance"); await settle();
  expect(posts()).toHaveLength(2); expect(posts()[1]![1]!.body).toBe(original);
  expect(accepted(render())).toBe(true); expect(onCommitted).toHaveBeenCalledTimes(1);
});

it("treats a malformed successful POST body as uncertain and reconciles its saved facts", async () => {
  await prepare(); post = async (command, id) => { commit(command, id); return new Response("{", { status: 200 }); };
  click(render(), "Record practice acceptance"); await settle();
  expect(text(render())).toContain("result is unknown");
  click(render(), "Load the saved acceptance"); await settle();
  expect(accepted(render())).toBe(true); expect(posts()).toHaveLength(1);
});

it.each([400, 503])("keeps a DATABASE_UNAVAILABLE/%s response uncertain rather than treating it as unsaved", async status => {
  await prepare(); post = async () => response({ code: "DATABASE_UNAVAILABLE" }, status);
  click(render(), "Record practice acceptance"); await settle();
  expect(text(render())).toContain("result is unknown"); expect(button(render(), "Record practice acceptance").disabled).toBe(true);
  expect(posts()).toHaveLength(1);
});

it.each(["failed", "invalid JSON", "wrong job", "invalid shape"])("a %s saved read preserves the hold and cannot show a fabricated acceptance", async failure => {
  await prepare(); post = async () => { throw new Error("Lost reply"); };
  click(render(), "Record practice acceptance"); await settle();
  const command = JSON.parse(posts()[0]![1]!.body as string) as Command;
  read = async () => failure === "failed" ? response({}, 503) : failure === "invalid JSON" ? new Response("{") : failure === "wrong job" ? response(commit(command, nextJob)) : response({ activeAcceptance: {} });
  click(render(), "Load the saved acceptance"); await settle();
  expect(text(render())).toContain("still unknown"); expect(accepted(render())).toBe(false);
  expect(button(render(), "Record practice acceptance").disabled).toBe(true); expect(posts()).toHaveLength(1); expect(onCommitted).not.toHaveBeenCalled();
});

it("does not release the hold for different saved acceptance facts on the same job", async () => {
  await prepare(); post = async () => { throw new Error("Lost reply"); };
  click(render(), "Record practice acceptance"); await settle();
  const command = JSON.parse(posts()[0]![1]!.body as string) as Command;
  commit({ ...command, statedMethod: "verbal" });
  click(render(), "Load the saved acceptance"); await settle();
  expect(text(render())).toContain("do not yet confirm"); expect(button(render(), "Cancel pre-live acceptance").disabled).toBe(true);
  expect(button(render(), "Start this practice job").disabled).toBe(true); expect(posts()).toHaveLength(1);
});

it("synchronously blocks double submission and contradictory acceptance handlers before rerender", async () => {
  await prepare(); let finish!: () => void;
  post = (command, id) => new Promise(resolve => { finish = () => resolve(response(commit(command, id))); });
  const tree = render(), before = mutations().length;
  button(tree, "Record practice acceptance").node.props.onClick();
  button(tree, "Record practice acceptance").node.props.onClick();
  button(tree, "Record customer decline").node.props.onClick();
  button(tree, "Supersede quote").node.props.onClick();
  expect(posts()).toHaveLength(1); expect(mutations()).toHaveLength(before + 1);
  expect(button(render(), "Record practice acceptance").disabled).toBe(true);
  finish(); await settle(); expect(accepted(render())).toBe(true); expect(onCommitted).toHaveBeenCalledTimes(1);
});

it.each(["POST", "saved read"])("a downstream refresh failure after a confirmed %s cannot reclassify acceptance as unknown", async via => {
  await prepare(); onCommitted.mockRejectedValue(new Error("Refresh failed"));
  if (via === "saved read") post = async (command, id) => { commit(command, id); throw new Error("Lost committed reply"); };
  click(render(), "Record practice acceptance"); await settle();
  if (via === "saved read") { click(render(), "Load the saved acceptance"); await settle(); }
  expect(accepted(render())).toBe(true); expect(text(render())).toContain("Acceptance was confirmed");
  expect(text(render())).not.toContain("result is unknown"); expect(button(render(), "Retry this same acceptance")).toBeUndefined();
  expect(posts()).toHaveLength(1); expect(onCommitted).toHaveBeenCalledTimes(1);
});

it("a late previous-job acceptance reply cannot change the new job or invoke its refresh", async () => {
  await prepare(); let finish!: () => void;
  post = (command, id) => new Promise(resolve => { finish = () => resolve(response(commit(command, id))); });
  click(render(), "Record practice acceptance"); render(nextJob); await settle(); render(nextJob);
  finish(); await settle();
  const tree = render(nextJob); expect(accepted(tree)).toBe(false); expect(text(tree)).not.toContain("Job accepted");
  expect(text(tree)).not.toContain("result is unknown"); expect(onCommitted).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
});

it("an unmounted acceptance handler discards its late reply without state updates or refresh", async () => {
  await prepare(); let finish!: () => void;
  post = (command, id) => new Promise(resolve => { finish = () => resolve(response(commit(command, id))); });
  click(render(), "Record practice acceptance"); hooks.unmount(); const writes = hooks.writes();
  finish(); await settle();
  expect(hooks.writes()).toBe(writes); expect(onCommitted).not.toHaveBeenCalled();
});

it("a late saved-acceptance recovery read cannot revive the previous job after navigation", async () => {
  await prepare(); post = async (command, id) => { commit(command, id); throw new Error("Lost committed reply"); };
  click(render(), "Record practice acceptance"); await settle();
  let finish!: () => void;
  read = id => id === jobId ? new Promise(resolve => { finish = () => resolve(response(saved.get(id))); }) : Promise.resolve(response(empty(id)));
  click(render(), "Load the saved acceptance"); render(nextJob); await settle(); render(nextJob);
  finish(); await settle();
  expect(accepted(render(nextJob))).toBe(false); expect(text(render(nextJob))).not.toContain("Saved acceptance loaded");
  expect(text(render(nextJob))).not.toContain("result is unknown"); expect(onCommitted).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
});

it("a focus read started before acceptance cannot overwrite its newer confirmed facts", async () => {
  await prepare(); let finish!: () => void;
  read = () => new Promise(resolve => { finish = () => resolve(response(empty())); });
  window.dispatchEvent(new Event("focus"));
  click(render(), "Record practice acceptance"); await settle(); expect(accepted(render())).toBe(true);
  finish(); await settle(); expect(accepted(render())).toBe(true); expect(posts()).toHaveLength(1);
});

it.each([["INVALID_QUOTE", 400, "Acceptance details were refused"], ["STALE_ACCEPTANCE", 409, "This quote version needs its own acceptance"]] as const)("an initial known pre-command %s refusal releases the form without claiming success", async (code, status, message) => {
  await prepare(); post = async () => response({ code }, status);
  click(render(), "Record practice acceptance"); await settle();
  expect(text(render())).toContain(message); expect(button(render(), "Record practice acceptance").disabled).toBe(false);
  expect(accepted(render())).toBe(false); expect(button(render(), "Retry this same acceptance")).toBeUndefined();
});

it.each([["INVALID_QUOTE", 400], ["STALE_ACCEPTANCE", 409]] as const)("a %s refusal on an explicit retry cannot erase the earlier unknown outcome", async (code, status) => {
  await prepare(); post = async () => { throw new Error("Lost reply"); };
  click(render(), "Record practice acceptance"); await settle(); const original = posts()[0]![1]!.body;
  post = async () => response({ code }, status);
  click(render(), "Retry this same acceptance"); await settle();
  expect(text(render())).toContain("result is unknown"); expect(button(render(), "Record practice acceptance").disabled).toBe(true);
  expect(posts()).toHaveLength(2); expect(posts()[1]![1]!.body).toBe(original);
});

it("a quote becoming read-only keeps saved reads available but blocks even a stale explicit retry handler", async () => {
  await prepare(); post = async () => { throw new Error("Lost reply"); };
  click(render(), "Record practice acceptance"); await settle();
  const oldRetry = button(render(), "Retry this same acceptance").node.props.onClick;
  const tree = render(jobId, { readOnly: true });
  expect(button(tree, "Retry this same acceptance").disabled).toBe(true);
  expect(button(tree, "Load the saved acceptance").disabled).toBe(false);
  oldRetry(); await settle(); expect(posts()).toHaveLength(1);
  click(tree, "Load the saved acceptance"); await settle();
  expect(text(render(jobId, { readOnly: true }))).toContain("do not yet confirm"); expect(posts()).toHaveLength(1);
});
