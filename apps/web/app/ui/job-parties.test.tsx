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
