import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExtraApprovals } from "./extra-approvals";

// Persistent hook slots exercise the rendered controls and handlers, as in customer/extra-approvals.
const hooks = vi.hoisted(() => ({
  cursor: 0, cells: [] as unknown[], effects: [] as (() => void)[],
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) hooks.cells[index] = initial;
    return [hooks.cells[index], (value: unknown) => {
      hooks.cells[index] = typeof value === "function" ? value(hooks.cells[index]) : value;
    }];
  },
  useCallback<T>(callback: T) { return callback; },
  useEffect(effect: () => void) {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) { hooks.cells[index] = true; hooks.effects.push(effect); }
  },
}));
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
// These panels own separate fetching and do not participate in pricing.
vi.mock("./must-decide", () => ({ MustDecide: () => null }));
vi.mock("./duplicate-candidates", () => ({ DuplicateCandidates: () => null }));
vi.mock("../../northside/northside-practice", () => ({ NorthsidePractice: () => null }));
beforeEach(() => {
  hooks.cursor = 0; hooks.cells = []; hooks.effects = [];
  vi.stubGlobal("React", React);
});
afterEach(() => vi.unstubAllGlobals());

type Node = React.ReactElement<{ children?: React.ReactNode; id?: string; disabled?: boolean; "data-testid"?: string; onClick?: () => void; onChange?: (event: { target: { value: string } }) => void }>;
function nodes(tree: React.ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement<Node["props"]>(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}
function text(tree: React.ReactNode): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (React.isValidElement<Node["props"]>(tree)) return text(tree.props.children);
  return typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}
const render = () => { hooks.cursor = 0; return ExtraApprovals(); };
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const rates = [
  { code: "FICTIONAL-A", description: "Fictional panel", unit: "panel", ratePence: 1000 },
  { code: "FICTIONAL-B", description: "Fictional fitting", unit: "fitting", ratePence: 1234 },
];
async function mount(state = "approved", role = "surveyor", availableRates = rates, refusal?: string) {
  const extra = { extraId: "fictional-extra", jobId: "fictional-job", orderReference: "FICTIONAL-169", description: "Extra fitting", note: "Practice only", state, outcome: state === "logged" ? null : state, quotedPence: state === "logged" ? null : 1000, netPence: state === "logged" ? null : 1000, requestId: null, revisionHash: null, steps: [], nextStepIndex: null, nextStepRole: null, clientRequired: false, linkIssued: false, linkClosed: null, hasPhoto: false, residentConfirmed: false };
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      posts.push({ url, body: JSON.parse(options.body as string) as Record<string, unknown> });
      return { ok: !refusal, json: async () => refusal ? { code: refusal } : {} };
    }
    if (url.endsWith("/revise")) return { ok: true, json: async () => ({ rates: availableRates }) };
    return { ok: true, json: async () => ({ role, extras: [extra], rates: state === "logged" ? { "fictional-job": availableRates } : {} }) };
  }));
  render(); hooks.effects.splice(0).forEach(effect => effect()); await settle();
  const button = () => nodes(render()).find(n => n.type === "button" && text(n) === (state === "logged" ? "Price this extra" : "Revise this extra"))!;
  const change = (field: "rate" | "qty", value: string) => {
    const id = `${state === "logged" ? "" : "revise-"}${field}-fictional-extra`;
    nodes(render()).find(n => n.props.id === id)!.props.onChange!({ target: { value } });
  };
  const preview = () => text(nodes(render()).find(n => n.props["data-testid"] === (state === "logged" ? "price-preview" : "revision-price-preview")));
  return { posts, button, change, preview };
}

it.each(["approved", "rejected"])("previews and posts a surveyor's %s revision using the selected server rate", async state => {
  const form = await mount(state);
  form.change("rate", "FICTIONAL-B"); form.change("qty", "3");
  expect(form.preview()).toBe("£37.02");
  expect(text(render())).toContain("Revised amount preview");
  expect(text(render())).toContain("The server recomputes this from the rate card.");
  expect(form.button().props.disabled).toBe(false);
  form.button().props.onClick!(); await settle();
  expect(form.posts).toEqual([{ url: "/api/northside/extras/fictional-extra/revise", body: { version: "northside-command.v1", jobId: "fictional-job", commandId: expect.any(String), sorCode: "FICTIONAL-B", quantity: 3 } }]);
  expect(text(render())).toContain("Price revised. A new approval request was created.");
});

for (const state of ["approved", "rejected", "logged"]) {
  it.each(["", "0", "-1", "1.5", "abc", "1001"])(`${state} quantity %j cannot submit or produce a fresh price`, async quantity => {
    const form = await mount(state);
    form.change("qty", quantity);
    expect(form.preview()).toBe("-");
    expect(form.button().props.disabled).toBe(true);
    // Invoke even a disabled control's handler to prove submission is guarded too.
    form.button().props.onClick!(); await settle();
    expect(form.posts).toEqual([]);
    expect(text(render())).not.toContain("Price revised.");
  });
  it(`${state} cannot submit without a matching rate`, async () => {
    const form = await mount(state, "surveyor", []);
    expect(form.preview()).toBe("-"); expect(form.button().props.disabled).toBe(true);
    form.button().props.onClick!(); await settle(); expect(form.posts).toEqual([]);
  });
}

it.each([["logged", "1"], ["logged", "1000"], ["approved", "1"], ["rejected", "1000"]])("retains valid %s pricing at quantity %s", async (state, quantity) => {
  const form = await mount(state);
  form.change("rate", "FICTIONAL-B"); form.change("qty", quantity);
  expect(form.preview()).toBe(quantity === "1" ? "£12.34" : "£12,340.00");
  expect(form.button().props.disabled).toBe(false);
  form.button().props.onClick!(); await settle();
  expect(form.posts[0]).toMatchObject({ url: `/api/northside/extras/fictional-extra/${state === "logged" ? "price" : "revise"}`, body: { sorCode: "FICTIONAL-B", quantity: Number(quantity) } });
});
it("keeps a revision refusal visible without reporting success", async () => {
  const form = await mount("approved", "surveyor", rates, "INVALID_TRANSITION");
  form.change("qty", "2"); form.button().props.onClick!(); await settle();
  expect(form.posts).toHaveLength(1);
  expect(text(render())).toContain("That step was refused (INVALID_TRANSITION).");
  expect(text(render())).not.toContain("Price revised.");
  expect(form.button().props.disabled).toBe(false);
});
it.each(["supervisor", "commercial_manager", "operative"])("keeps pricing and revision hidden from %s", async role => {
  for (const state of ["approved", "rejected", "logged"]) {
    hooks.cursor = 0; hooks.cells = []; hooks.effects = [];
    await mount(state, role);
    expect(text(render())).not.toContain("Revise this extra");
    expect(text(render())).not.toContain("Price this extra");
    expect(nodes(render()).some(n => n.props["data-testid"] === "revision-price-preview")).toBe(false);
  }
});
