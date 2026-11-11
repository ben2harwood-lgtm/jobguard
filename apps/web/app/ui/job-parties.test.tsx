import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { jobPartiesWorkspaceV1, siteMatchKey } from "@jobguard/core";
import { JobParties } from "./job-parties";

// Exercise the real component's handlers without a DOM/server. Browser persistence is covered in CH-3a.spec.ts.
const facts = vi.hoisted(() => ({ generation: 0 }));
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
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(), useContext: () => facts.generation, ...hooks }));
afterEach(() => { facts.generation = 0; hooks.reset(); vi.unstubAllGlobals(); });

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
    const sent: Array<Extract<import("@jobguard/core").JobPartiesCommandV1, { action: "save_form" }>> = [];
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
    expect(sent.map(input => input.action)).toEqual(["save_form"]);
    expect(sent[0]).toMatchObject({ customerRef: { revisionId: id(4), expectedRevision: party === "customer" ? 2 : 1 }, savedSiteRevisionId: id(6), payingPartyRevisionId: party === "payer" ? id(8) : null });
  });
  it.each(["customer", "payer"] as const)("uses the newer %s revision only after choosing it explicitly", async party => {
    const { first } = sharedViews(party); const { render, sent } = await panel(first); let tree = render();
    const select = find(tree, party === "customer" ? "Choose a customer" : "Who pays?")!;
    (select.props.onChange as (e: unknown) => void)({ target: { value: party === "customer" ? id(3) : id(9) } }); tree = render();
    (find(tree, "Customer and site details")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(sent.map(input => input.action)).toEqual(["save_form"]);
    expect(party === "customer" ? sent[0]!.customerRef!.revisionId : sent[0]!.payingPartyRevisionId).toBe(id(9));
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

function nodes(node: React.ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...nodes(node.props.children as React.ReactNode)];
}
const text = (tree: React.ReactNode): string => {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (React.isValidElement<Record<string, unknown>>(tree)) return text(tree.props.children as React.ReactNode);
  return typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
};
it("shows saved state only for the saved draft, records a successful save time and keeps technical identities closed", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
  const snapshot = view();
  const fetch = vi.fn(async (_url, options) => {
    if (!options?.method) return { ok: true, json: async () => snapshot };
    const input = JSON.parse(options.body);
    return { ok: true, json: async () => ({ version: "job-parties-command-result.v1", environment: "synthetic_demo", commandId: input.commandId, id: id(2), realExternalActions: 0 }) };
  });
  vi.stubGlobal("fetch", fetch);
  const render = () => { hooks.render(); const tree = JobParties({ jobId: id(1) }); hooks.effects(); return tree; };
  render(); await new Promise<void>(resolve => setImmediate(resolve)); let tree = render();
  expect(text(tree)).not.toContain("Unsaved draft");
  const details = nodes(tree).find(n => n.type === "details")!;
  expect(details.props.open).toBeUndefined(); expect(text(details)).toContain("Technical details");
  expect(nodes(details).find(n => n.props["data-testid"] === "party-binding-id")!.props.children).toBe(id(2));
  for (const testId of ["job-party-details", "party-customer", "party-site", "party-payer"]) expect(nodes(tree).some(n => n.props["data-testid"] === testId)).toBe(true);
  expect(nodes(tree).find(n => n.type === "h2")!.props.id).toBe(`parties-${id(1)}`);
  const link = nodes(tree).find(n => n.type === "a")!;
  expect(text(link)).toBe("Bring in a job that's already under way"); expect(link.props.href).toBe(`/jobs/${id(1)}/imports`);
  expect(text(tree)).toContain("Property reference (UPRN, optional)");
  for (const [label, changed] of [["Customer name", "Changed customer"], ["Customer type", "business"], ["Customer email (fictional, optional)", "fictional@example.invalid"], ["Customer phone (fictional, optional)", "01234567890"], ["Company number (optional)", "12345678"], ["Who pays?", id(9)], ["Premises address", "Other fictional street"], ["More address lines (optional, one per line)", "Other line"], ["Town", "Other town"], ["UK postcode", "M1 1AE"], ["Flat or unit (optional)", "2"], ["UPRN (optional)", "123"]] as const) {
    const original = find(tree, label)!.props.value;
    (find(tree, label)!.props.onChange as (e: unknown) => void)({ target: { value: changed } }); tree = render();
    expect(text(tree), label).toContain("Unsaved draft — use Save customer and site to record it.");
    (find(tree, label)!.props.onChange as (e: unknown) => void)({ target: { value: original } }); tree = render();
    expect(text(tree), label).not.toContain("Unsaved draft");
  }
  (find(tree, "Customer and site details")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
  await new Promise<void>(resolve => setImmediate(resolve)); tree = render();
  expect(text(tree)).toContain("Saved at "); expect(text(tree)).not.toContain("Unsaved draft");
  const time = nodes(tree).find(n => n.type === "time")!;
  expect(new Date(time.props.dateTime as string).getTime()).not.toBeNaN();
  expect(fetch.mock.calls.filter(([, options]) => options?.method)).toHaveLength(1);
});
it("keeps a new unsaved job labelled as a draft", async () => {
  vi.stubGlobal("React", React); vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ...view(), current: null, currentIds: null }) })));
  const render = () => { hooks.render(); const tree = JobParties({ jobId: id(1) }); hooks.effects(); return tree; };
  render(); await new Promise<void>(resolve => setImmediate(resolve));
  expect(text(render())).toContain("Unsaved draft — use Save customer and site to record it.");
});

describe("atomic form and own-word suggestions", () => {
  const words = "Bathroom refit for Mrs Sample at 4 Madeup Lane. Rip out the old suite and take it away, fit a new bath, basin and toilet, tile the walls and floor, new extractor fan. About 4800 pounds all in, should take two weeks.";
  const proposal = (source = words) => ({ version: 1, environment: "synthetic_demo", captureId: id(10), jobId: id(1), proposalId: id(11), reviewId: id(12),
    source: { text: source, version: 1, kind: "text", acquisition: null, audioByteLength: 0 }, proposal: { title: "Bathroom refit", lines: [], questions: [] }, review: null, status: "draft" });
  async function panel(options: { saved?: boolean; late?: boolean; source?: string } = {}) {
    vi.stubGlobal("React", React);
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
    const snapshot = options.saved ? view() : { ...view(), current: null, currentIds: null, customers: [], sites: [] };
    const sent: Record<string, unknown>[] = [];
    let deliver: ((value: unknown) => void) | undefined;
    const waiting = new Promise(resolve => { deliver = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (String(url).endsWith("/proposal")) return { ok: true, json: async () => options.late ? waiting : proposal(options.source) };
      if (init?.method) { const input = JSON.parse(init.body); sent.push(input); return { ok: false, json: async () => ({ code: "DATABASE_UNAVAILABLE" }) }; }
      return { ok: true, json: async () => structuredClone(snapshot) };
    }));
    const render = () => { hooks.render(); const tree = JobParties({ jobId: id(1) }); hooks.effects(); return tree; };
    render(); await tick(); render(); await tick();
    const change = (label: string, value: string) => {
      const tree = render(); (find(tree, label)!.props.onChange as (e: unknown) => void)({ target: { value } });
      (find(tree, "Customer and site details")!.props.onChange as () => void)();
    };
    const submit = async () => { (find(render(), "Customer and site details")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} }); await tick(); };
    return { render, change, submit, sent, deliver: () => deliver!(proposal()) };
  }
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
  it.each([
    [words, "Mrs Sample", "4 Madeup Lane"],
    ["Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about 900 quid, four days.", "Mr Example", "9 Notreal Road"],
  ])("suggests editable parties from an authorized validated response: %s", async (source, name, address) => {
    const p = await panel({ source }); const tree = p.render();
    expect(find(tree, "Customer name")!.props.value).toBe(name);
    expect(find(tree, "Premises address")!.props.value).toBe(address);
    for (const field of ["Town", "UK postcode", "Customer email (fictional, optional)", "Customer phone (fictional, optional)"]) expect(find(tree, field)!.props.value).toBe("");
    expect(text(tree)).toContain("Suggested from your words — check before saving"); expect(p.sent).toEqual([]);
    p.change("Customer name", "Edited fictional customer"); expect(find(p.render(), "Customer name")!.props.value).toBe("Edited fictional customer");
  });
  it("rejects ZZ1 1ZZ twice without a write, retains the draft, then sends one full form and reuses the retry command", async () => {
    const p = await panel(); p.change("Town", "London"); p.change("Customer email (fictional, optional)", "sample@example.invalid"); p.change("UK postcode", "ZZ1 1ZZ");
    await p.submit(); await p.submit(); expect(p.sent).toEqual([]);
    expect(text(p.render())).toContain("Check UK postcode. Use a valid-format practice postcode, such as SW1A 1AA. Nothing was saved. INVALID_PARTIES");
    expect(find(p.render(), "UK postcode")!.props.value).toBe("ZZ1 1ZZ"); expect(find(p.render(), "Customer name")!.props.value).toBe("Mrs Sample");
    p.change("UK postcode", "SW1A 1AA"); await p.submit(); await p.submit();
    expect(p.sent).toHaveLength(2); expect(p.sent[1]).toEqual(p.sent[0]);
    expect(p.sent[0]).toMatchObject({ action: "save_form", customer: { name: "Mrs Sample" }, site: { postcode: "SW1A 1AA" }, expectedBindingId: null, customerRef: null });
  });
  it.each(["saved", "edited", "selected"])("a late source never replaces %s parties", async state => {
    const p = await panel({ late: true, saved: state === "saved" });
    if (state === "edited") p.change("Customer name", "My fictional edit");
    if (state === "selected") { p.change("Choose a customer", ""); p.change("Customer name", "Chosen fictional customer"); }
    const name = find(p.render(), "Customer name")!.props.value;
    p.deliver(); await tick(); expect(find(p.render(), "Customer name")!.props.value).toBe(name);
    expect(text(p.render())).not.toContain("Suggested from your words");
  });
  it("retains the labelled practice example when source words supply no party", async () => {
    const p = await panel({ source: "Inspect the fictional shed" }); expect(text(p.render())).toContain("Practice example — check before saving");
    expect(find(p.render(), "Customer name")!.props.value).toBe("Practice Customer"); expect(p.sent).toEqual([]);
  });
});

it.each(["lifecycle", "navigation"])("keeps unsaved party edits when a %s refresh updates saved facts", async kind => {
  hooks.reset(); vi.stubGlobal("React", React);
  const listeners = new Map<string, (event: Event) => void>();
  vi.stubGlobal("window", { addEventListener: (name: string, fn: (event: Event) => void) => listeners.set(name, fn), removeEventListener: vi.fn() });
  let snapshot = view();
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ({ ok: true, json: async () => snapshot })));
  const render = () => { hooks.render(); const tree = JobParties({ jobId: id(1) }); hooks.effects(); return tree; };
  render(); await new Promise<void>(resolve => setImmediate(resolve)); let tree = render();
  (find(tree, "Customer name")!.props.onChange as (e: unknown) => void)({ target: { value: "Unsaved fictional edit" } });
  tree = render();
  snapshot = structuredClone(snapshot); snapshot.currentIds!.bindingId = id(99); snapshot.current!.bindingId = id(99);
  if (kind === "lifecycle") listeners.get("job-lifecycle-changed")!({ detail: id(1) } as unknown as Event);
  else { facts.generation++; render(); }
  await new Promise<void>(resolve => setImmediate(resolve)); tree = render();
  expect(find(tree, "Customer name")!.props.value).toBe("Unsaved fictional edit");
  expect(text(tree)).toContain("Unsaved draft");
  // The original baseline still refuses saving across that changed binding.
  (find(tree, "Customer and site details")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(text(render())).toContain("This job changed");
});
