import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ExtraApprovals from "./approvals";

// Exercise the component's handlers with persistent hook slots, as in job-parties.test.tsx.
const hooks = vi.hoisted(() => ({
  cursor: 0, cells: [] as unknown[], effects: [] as (() => void | (() => void))[], cleanups: [] as (() => void)[],
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) hooks.cells[index] = initial;
    return [hooks.cells[index], (value: unknown) => { hooks.cells[index] = value; }];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) hooks.cells[index] = { current: initial };
    return hooks.cells[index];
  },
  useEffect(effect: () => void | (() => void)) {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) { hooks.cells[index] = true; hooks.effects.push(effect); }
  },
}));
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
beforeEach(() => {
  hooks.cursor = 0; hooks.cells = []; hooks.effects = []; hooks.cleanups = [];
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { location: { search: "?jobId=fictional-job" } });
});
afterEach(() => vi.unstubAllGlobals());

const extra = { requestId: "fictional-extra", description: "Fictional extra socket", revision: 1, revisionHash: "fictional-hash", netPence: 5000, doneWithoutRequiredPreapproval: false };
const ok = (body: unknown) => ({ ok: true, json: async () => body });
type Node = React.ReactElement<{ children?: React.ReactNode; disabled?: boolean; onClick?: () => void }>;
function buttons(tree: React.ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(buttons);
  if (!React.isValidElement<Node["props"]>(tree)) return [];
  return tree.type === "button" ? [tree] : buttons(tree.props.children);
}
function render() { hooks.cursor = 0; return ExtraApprovals(); }
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
async function mount() {
  render(); hooks.effects.splice(0).forEach(effect => { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup); }); await settle();
  return render();
}
async function click(tree: React.ReactNode, index = 0) {
  const button = buttons(tree)[index]!;
  expect(button.props.disabled).toBe(false);
  button.props.onClick!(); await settle();
  return render();
}
function mockFetch(decide: (body: Record<string, unknown>) => unknown, failRead = false) {
  const commands: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    if (body.action === "decide") { commands.push(body); return decide(body); }
    if (failRead && commands.length) throw new Error("queue unavailable");
    return ok({ items: body.action === "queue" ? [extra] : [] });
  }));
  return commands;
}

it.each(["STALE_REVISION", "HASH_MISMATCH", "ALREADY_DECIDED", "LINK_REPLAYED"])("releases both buttons and uses a new command after final %s refusal", async code => {
  const commands = mockFetch(() => ({ ok: false, status: 409, json: async () => ({ code }) }));
  let tree = await click(await mount());
  expect(buttons(tree).map(button => button.props.disabled)).toEqual([false, false]);
  if (code === "STALE_REVISION") expect(renderToStaticMarkup(tree)).toContain("This revision is stale. Ask the contractor for a new request.");
  tree = await click(tree, 1);
  expect(commands).toHaveLength(2);
  expect(commands[1]!.commandId).toEqual(expect.any(String));
  expect(commands[1]!.commandId).not.toBe(commands[0]!.commandId);
  expect(commands.map(command => command.decision)).toEqual(["approve", "reject"]);
});

it("retains the exact command for a network failure retry", async () => {
  const commands = mockFetch(() => { throw new Error("network failure"); });
  const tree = await click(await mount());
  expect(buttons(tree).map(button => button.props.disabled)).toEqual([false, true]);
  expect(renderToStaticMarkup(tree)).toContain("Decision could not be confirmed");
  await click(tree);
  expect(commands).toHaveLength(2);
  expect(commands[0]!.commandId).toEqual(expect.any(String));
  expect(commands[1]).toEqual(commands[0]);
});

it("reports a recorded decision separately when the follow-up queue read fails", async () => {
  const commands = mockFetch(() => ok({}), true);
  const html = renderToStaticMarkup(await click(await mount()));
  expect(commands).toHaveLength(1);
  expect(html).toContain('role="status">Your decision is recorded.');
  expect(html).toContain("The approval queue could not be loaded. Reload the page.");
  expect(html).toContain("Your past decisions could not be loaded.");
  expect(buttons(render())).toHaveLength(0);
  expect(html).not.toContain("Decision could not be confirmed");
});

const past = { requestId: "fictional-past", decision: "reject", recordedAt: "2026-11-01" };
const refused = (code: string) => ({ ok: false, json: async () => ({ code }) });
function readResponses(queue: () => unknown, history: () => unknown) {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    requests.push(body);
    return body.action === "history" ? history() : queue();
  }));
  return requests;
}

it.each([
  ["STALE_REVISION", "This revision is stale."],
  ["LINK_EXPIRED", "This invitation has expired."],
  ["ALREADY_DECIDED", "This request has already been decided."],
])("loads independently authorized history despite %s queue failure", async (code, message) => {
  const requests = readResponses(() => refused(code), () => ok({ items: [past] }));
  const tree = await mount();
  const html = renderToStaticMarkup(tree);
  expect(requests.map(request => request.action)).toEqual(["queue", "history"]);
  expect(html).toContain(message);
  expect(html).toContain("fictional-past: reject");
  expect(html).not.toContain("Access refused");
  expect(buttons(tree)).toHaveLength(0);
});

it("starts history without waiting for the queue and keeps a valid queue after independent history failure", async () => {
  let finishQueue!: (value: unknown) => void;
  const queue = new Promise(resolve => { finishQueue = resolve; });
  const requests = readResponses(() => queue, () => refused("CUSTOMER_UNAVAILABLE"));
  await mount();
  expect(requests.map(request => request.action)).toEqual(["queue", "history"]);
  finishQueue(ok({ items: [extra] })); await settle();
  const tree = render();
  expect(buttons(tree).map(button => button.props.disabled)).toEqual([false, false]);
  expect(renderToStaticMarkup(tree)).toContain("Your past decisions could not be loaded.");
});

it.each(["CUSTOMER_REFUSED", "LINK_REVOKED"])("shows neither queue nor history after current access refusal %s", async code => {
  readResponses(() => refused(code), () => refused("CUSTOMER_REFUSED"));
  const tree = await mount();
  expect(renderToStaticMarkup(tree)).toContain("Access refused");
  expect(renderToStaticMarkup(tree)).not.toContain(past.requestId);
  expect(buttons(tree)).toHaveLength(0);
});

it.each(["queue", "history"])("a revoked or foreign-job refusal from %s wins over concurrent content", async denied => {
  readResponses(
    () => denied === "queue" ? refused("CUSTOMER_REFUSED") : ok({ items: [extra] }),
    () => denied === "history" ? refused("CUSTOMER_REFUSED") : ok({ items: [past] }),
  );
  const tree = await mount();
  expect(renderToStaticMarkup(tree)).toContain("Access refused");
  expect(renderToStaticMarkup(tree)).not.toContain(past.requestId);
  expect(buttons(tree)).toHaveLength(0);
});

it("clears loaded history and queue when a decision detects revoked access", async () => {
  readResponses(() => ok({ items: [extra] }), () => ok({ items: [past] }));
  const initial = await mount();
  expect(renderToStaticMarkup(initial)).toContain(past.requestId);
  vi.stubGlobal("fetch", vi.fn(async () => refused("CUSTOMER_REFUSED")));
  const tree = await click(initial);
  expect(buttons(tree)).toHaveLength(0);
  expect(renderToStaticMarkup(tree)).not.toContain(past.requestId);
  expect(renderToStaticMarkup(tree)).toContain("Access refused");
});

it("clears old content while reloading after a recorded decision and never restores denied history", async () => {
  const commands = mockFetch(() => ok({}));
  const tree = await mount();
  let finishHistory!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    if (body.action === "decide") { commands.push(body); return ok({}); }
    if (body.action === "queue") return refused("STALE_REVISION");
    return new Promise(resolve => { finishHistory = resolve; });
  }));
  const loading = await click(tree);
  expect(buttons(loading)).toHaveLength(0);
  finishHistory(refused("CUSTOMER_REFUSED")); await settle();
  expect(renderToStaticMarkup(render())).toContain("Access refused");
  expect(buttons(render())).toHaveLength(0);
});

it("ignores old reads after leaving the job/session page", async () => {
  let finishHistory!: (value: unknown) => void;
  readResponses(() => ok({ items: [extra] }), () => new Promise(resolve => { finishHistory = resolve; }));
  await mount();
  hooks.cleanups.forEach(cleanup => cleanup());
  finishHistory(ok({ items: [past] })); await settle();
  expect(renderToStaticMarkup(render())).not.toContain(past.requestId);
  expect(buttons(render())).toHaveLength(0);
});


it("renders a fully authorized queue and current history together", async () => {
  readResponses(() => ok({ items: [extra] }), () => ok({ items: [past] }));
  const tree = await mount();
  expect(buttons(tree).map(button => button.props.disabled)).toEqual([false, false]);
  const html = renderToStaticMarkup(tree);
  expect(html).toContain(extra.description);
  expect(html).toContain("fictional-past: reject");
  expect(html).not.toContain('role="alert"');
});
