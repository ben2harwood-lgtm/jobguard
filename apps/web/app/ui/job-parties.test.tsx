import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { jobPartiesWorkspaceV1, siteMatchKey } from "@jobguard/core";
import { JobParties } from "./job-parties";

// Exercise the real component's handlers without a DOM/server. Browser persistence is covered in CH-3a.spec.ts.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: { value?: unknown; current?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }[] = [];
  const effects: (() => void)[] = [];
  return {
    reset() { cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index]!.value, (value: unknown) => { slots[index]!.value = value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn: unknown, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) slots[index] = { value: fn, deps };
      return slots[index]!.value;
    },
    useEffect(fn: () => (() => void) | void, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) {
        slots[index] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[index]!.cleanup = fn() || undefined; });
      }
    },
  };
});
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(), ...hooks }));
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); });

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const customer = { version: "customer.v1", name: "Fictional customer", type: "person" } as const;
const site = { version: "site.v1", addressLines: ["14 Fictional Street", "Fictional Court"], town: "London", postcode: "SW1A 1AA" } as const;
const view = () => jobPartiesWorkspaceV1.parse({
  version: "job-parties-workspace.v1", environment: "synthetic_demo", jobId: id(1), jobRevision: 1, status: "quoting",
  current: { version: "job-parties-snapshot.v1", bindingId: id(2), customerRevisionId: id(4), payingPartyRevisionId: id(4), siteRevisionId: id(6), customer, payingParty: customer, site },
  currentIds: { bindingId: id(2), customerId: id(3), payingPartyId: id(3), siteId: id(5) },
  customers: [{ id: id(3), revisionId: id(4), revision: 1, customer }],
  sites: [{ id: id(5), revisionId: id(6), site, matchKey: siteMatchKey(site) }], recognition: [], realExternalActions: 0,
});
type Node = React.ReactElement<Record<string, unknown>>;
function find(node: React.ReactNode, label: string): Node | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, label)).find(Boolean);
  if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
  return node.props["aria-label"] === label ? node : find(node.props.children as React.ReactNode, label);
}

describe("site reuse confirmation in the Customer and site panel", () => {
  it.each([["Town", "Fictional Borough"], ["UK postcode", "M1 1AE"], ["UPRN (optional)", "987654321"]])("editing %s clears the old reuse and its confirmation", async (label, value) => {
    hooks.reset(); vi.stubGlobal("React", React);
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => view() }));
    const render = () => { hooks.render(); const tree = JobParties({ jobId: id(1) }); hooks.effects(); return tree; };
    let tree = render();
    // Finish the initial asynchronous workspace load; no network, timers or provider effects are involved.
    await new Promise<void>(resolve => setImmediate(resolve)); tree = render();
    const change = (name: string, target: Record<string, unknown>) => {
      const input = find(tree, name); expect(input, name).toBeDefined();
      (input!.props.onChange as (event: unknown) => void)({ target }); tree = render();
    };
    change("Possible existing places", { value: id(5) });
    change("I confirm this is the same place", { checked: true });
    expect(find(tree, "I confirm this is the same place")!.props.checked).toBe(true);
    change(label, { value });
    expect(find(tree, "I confirm this is the same place")).toBeUndefined();
    if (label !== "UK postcode") expect(find(tree, "Possible existing places")!.props.value).toBe("");
    else {
      // The edited postcode hides suggestions. Bringing them back must not revive the hidden approval.
      change("UK postcode", { value: "SW1A 1AA" });
      expect(find(tree, "Possible existing places")!.props.value).toBe("");
      expect(find(tree, "I confirm this is the same place")).toBeUndefined();
    }
    change("Possible existing places", { value: id(5) });
    expect(find(tree, "I confirm this is the same place")!.props.checked).toBe(false);
  });
});

describe("shared registry revisions never silently replace a job's saved parties", () => {
  const sharedViews = (party: "customer" | "payer") => {
    const first = view();
    if (party === "payer") {
      first.current!.payingPartyRevisionId = id(8); first.current!.payingParty = { ...customer, name: "Fictional saved payer" };
      first.currentIds!.payingPartyId = id(7);
      first.customers.push({ id: id(7), revisionId: id(8), revision: 1, customer: first.current!.payingParty });
    }
    const identity = party === "customer" ? id(3) : id(7);
    const second = structuredClone(first); second.jobId = id(20); second.current!.bindingId = id(21); second.currentIds!.bindingId = id(21);
    const row = second.customers.find(c => c.id === identity)!;
    row.revisionId = id(9); row.revision = 2; row.customer = { ...row.customer, name: "Revised on the other fictional job" };
    if (party === "customer") { second.current!.customerRevisionId = id(9); second.current!.customer = row.customer; }
    else { second.current!.payingPartyRevisionId = id(9); second.current!.payingParty = row.customer; }
    first.customers = structuredClone(second.customers);
    return { first, second };
  };
  async function panel(snapshot: ReturnType<typeof view>) {
    hooks.reset(); vi.stubGlobal("React", React);
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
    const sent: { action: string; parties: Record<string, string | null> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      if (!options?.method) return { ok: true, json: async () => structuredClone(snapshot) };
      const input = JSON.parse(options.body); sent.push(input);
      return { ok: true, json: async () => ({ version: "job-parties-command-result.v1", environment: "synthetic_demo", commandId: input.commandId, id: id(30), revisionId: id(9), realExternalActions: 0 }) };
    }));
    const render = () => { hooks.render(); const tree = JobParties({ jobId: snapshot.jobId }); hooks.effects(); return tree; };
    render(); await new Promise<void>(resolve => setImmediate(resolve));
    return { render, sent };
  }
  it.each(["customer", "payer"] as const)("reopens the bound %s snapshot and saves its exact revision after a second job revises the registry", async party => {
    const { first, second } = sharedViews(party);
    expect(second.current![party === "customer" ? "customerRevisionId" : "payingPartyRevisionId"]).toBe(id(9));
    const { render, sent } = await panel(first); const tree = render();
    expect(find(tree, "Customer name")!.props.value).toBe(first.current!.customer.name);
    expect(find(tree, "Who pays?")!.props.value).toBe(party === "payer" ? id(8) : "");
    await (find(tree, "Customer and site details")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(sent.map(input => input.action)).toEqual(["bind"]);
    expect(sent[0]!.parties).toEqual({ version: "job-parties.v1", customerRevisionId: id(4), siteRevisionId: id(6), payingPartyRevisionId: party === "payer" ? id(8) : null });
  });
  it.each(["customer", "payer"] as const)("uses the newer %s revision only after choosing it explicitly", async party => {
    const { first } = sharedViews(party); const { render, sent } = await panel(first); let tree = render();
    const select = find(tree, party === "customer" ? "Choose a customer" : "Who pays?")!;
    (select.props.onChange as (e: unknown) => void)({ target: { value: party === "customer" ? id(3) : id(9) } }); tree = render();
    (find(tree, "Customer and site details")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(sent.map(input => input.action)).toEqual(["bind"]);
    expect(sent[0]!.parties[party === "customer" ? "customerRevisionId" : "payingPartyRevisionId"]).toBe(id(9));
  });
  it.each(["customer", "payer"] as const)("keeps stale-edit protection when the shared %s changes again while the panel is open", async party => {
    const { first } = sharedViews(party); const { render, sent } = await panel(first); let tree = render();
    const row = first.customers.find(c => c.id === (party === "customer" ? id(3) : id(7)))!;
    row.revisionId = id(10); row.revision = 3; row.customer = { ...row.customer, name: "Changed again elsewhere" };
    (find(tree, "Customer and site details")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    await new Promise<void>(resolve => setImmediate(resolve)); tree = render();
    expect(sent).toEqual([]); expect(JSON.stringify(tree)).toContain("This job changed");
    expect(find(tree, party === "customer" ? "Customer name" : "Who pays?")!.props.value).toBe(party === "customer" ? "Changed again elsewhere" : id(10));
  });
  it("refuses editing an older bound customer over a newer registry revision before any write", async () => {
    const { first } = sharedViews("customer"); const { render, sent } = await panel(first); let tree = render();
    (find(tree, "Customer name")!.props.onChange as (e: unknown) => void)({ target: { value: "Edit of the saved old snapshot" } }); tree = render();
    (find(tree, "Customer and site details")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(sent).toEqual([]);
    expect(JSON.stringify(render())).toContain("registry");
  });
});
