import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ExtraApprovals from "./approvals";

// Exercise the component's handlers with persistent hook slots, as in job-parties.test.tsx.
const hooks = vi.hoisted(() => ({
  cursor: 0, cells: [] as unknown[], effects: [] as (() => void)[],
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
  useEffect(effect: () => void) {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) { hooks.cells[index] = true; hooks.effects.push(effect); }
  },
}));
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
beforeEach(() => {
  hooks.cursor = 0; hooks.cells = []; hooks.effects = [];
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
  render(); hooks.effects.splice(0).forEach(effect => effect()); await settle();
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
  expect(html).toContain("Your decision is recorded, but the list could not be reloaded. Reload the page.");
  expect(html).not.toContain("Decision could not be confirmed");
});
