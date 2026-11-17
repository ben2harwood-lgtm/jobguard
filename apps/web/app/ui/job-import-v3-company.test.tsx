import { afterEach, expect, it, vi } from "vitest";
import * as React from "react";
import { JobImport } from "./job-import-v3";
import { selectCompany } from "../meter/company-selection";
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: { value?: unknown; current?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }[] = [];
  const effects: (() => void)[] = [];
  return {
    unmount() { for (const slot of slots) slot.cleanup?.(); },
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
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });


type Node = React.ReactElement<Record<string, any>>;
function find(node: React.ReactNode, match: (node: Node) => boolean): Node | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, match)).find(Boolean);
  if (!React.isValidElement<Record<string, any>>(node)) return undefined;
  return match(node) ? node : find(node.props.children, match);
}

const session = { csrfToken: "csrf", memberships: [{ tenantId: "a1500000-0000-4000-8000-000000000001", name: "Fictional A" }, { tenantId: "a1500000-0000-4000-8000-000000000002", name: "Fictional B" }] };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function workspace(tenant = "a1500000-0000-4000-8000-000000000002") {
  const wrapper = JobImport({ sourceJobId: "fictional-source", company: true });
  const selected = selectCompany(session, tenant)!;
  const child = (wrapper.props as any).children(selected) as Node;
  return () => { hooks.render(); const tree = (child.type as any)(child.props); hooks.effects(); return tree; };
}
it("binds source/read to B, refreshes before preview, and blocks adoption after B is revoked", async () => {
  hooks.reset(); vi.stubGlobal("React", React);
  let revoked = false;
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/auth/session") return Response.json({ ...session, memberships: revoked ? [session.memberships[0]] : session.memberships });
    if (path.endsWith("/source")) return Response.json({ version: "job-import-source.v1", bindingId: "10000000-0000-4000-8000-000000000002" });
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  const render = workspace(); render(); await flush(); render();
  const business = fetcher.mock.calls.filter(([path]) => path !== "/api/auth/session");
  expect(business.map(([path]) => path.split("/").at(-1)).sort()).toEqual(["read", "source"]);
  for (const [, init] of business) expect(init?.headers).toMatchObject({ "x-tenant-id": "a1500000-0000-4000-8000-000000000002" });
  revoked = true;
  // Invoke the handler directly to attack the disabled UI as well as the server guard.
  find(render(), n => n.type === "button" && n.props.children === "Preview import")!.props.onClick();
  await flush();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  expect(find(render(), n => n.props.role === "alert")).toBeDefined();
});
it("keeps the practice importer on its existing routes without requesting a company session", async () => {
  hooks.reset(); vi.stubGlobal("React", React);
  const fetcher = vi.fn(async () => Response.json({}, { status: 404 })); vi.stubGlobal("fetch", fetcher);
  const child = JobImport({ sourceJobId: "fictional-source" }) as Node;
  hooks.render(); (child.type as any)(child.props); hooks.effects(); await flush();
  expect(fetcher.mock.calls).toHaveLength(2);
  // No company bootstrap and no company headers are introduced on the practice path.
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain("/api/auth/session");
});
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Same strict shape as the existing core import-contract fixture; synthetic unit data only.
const snapshot = {
  version: "adopt-job.v3", fixtureId: "fictional-extension-v3", sourceJobId: id(1),
  parties: { bindingId: id(2), customerRevisionId: id(3), siteRevisionId: id(4), payingPartyRevisionId: id(3) },
  lifecyclePoint: "live", baseline: { sourceBaselineId: id(5), sourceHash: "a".repeat(64), description: "Fictional baseline", acceptedNetPence: 300000,
    lines: [{ sourceLineId: id(6), description: "Fictional scope", netPence: 300000 }] },
  terms: { version: "synthetic_demo_import.v3", policyVersion: "reference_fee_policy_v3", commercialTrack: "small_builder" },
  attestation: { version: "import-attestation.v3", wording: "I attest this fictional baseline.", attest: true }, historyManifest: [],
};
async function click(render: () => React.ReactNode, name: string) {
  const button = find(render(), n => n.type === "button" && n.props.children === name)!;
  expect(button.props.disabled).not.toBe(true); button.props.onClick(); await flush();
}
it("keeps the exact adoption command on an unchanged-company retry and clears it after an authority change", async () => {
  hooks.reset(); vi.stubGlobal("React", React);
  let changed = false;
  const commands: unknown[] = [];
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/auth/session") return Response.json({ ...session, csrfToken: changed ? "changed" : session.csrfToken });
    if (path.endsWith("/source")) return Response.json({ version: "job-import-source.v1", bindingId: id(2) });
    if (path.endsWith("/read")) return Response.json({}, { status: 404 });
    if (path.endsWith("/preview")) return Response.json({ snapshot, previewHash: "a".repeat(64) });
    commands.push(JSON.parse(init!.body as string));
    throw new Error("Unknown network outcome");
  });
  vi.stubGlobal("fetch", fetcher);
  const render = workspace(); render(); await flush();
  await click(render, "Preview import");
  find(render(), n => n.props.type === "checkbox")!.props.onChange({ target: { checked: true } });
  await click(render, "Confirm import"); await click(render, "Confirm import");
  expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]);
  expect(commands[0]).toMatchObject({ commandId: expect.any(String), attest: true, previewHash: "a".repeat(64) });
  changed = true; await click(render, "Confirm import");
  expect(commands).toHaveLength(2);
  expect(find(render(), n => n.props.type === "checkbox")).toBeUndefined();
  expect(find(render(), n => n.type === "button" && n.props.children === "Preview import")!.props.disabled).toBe(true);
});
it("ignores a late A preview after switching to a fresh B workspace", async () => {
  hooks.reset(); vi.stubGlobal("React", React);
  let complete!: (response: Response) => void;
  const fetcher = vi.fn(async (path: string) => {
    if (path === "/api/auth/session") return Response.json(session);
    if (path.endsWith("/source")) return Response.json({ version: "job-import-source.v1", bindingId: id(2) });
    if (path.endsWith("/preview")) return new Promise<Response>(resolve => { complete = resolve; });
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  const renderA = workspace("a1500000-0000-4000-8000-000000000001"); renderA(); await flush();
  await click(renderA, "Preview import");
  hooks.unmount(); hooks.reset();
  const renderB = workspace("a1500000-0000-4000-8000-000000000002"); renderB(); await flush();
  complete(Response.json({ snapshot, previewHash: "a".repeat(64) })); await flush();
  expect(find(renderB(), n => n.props["aria-label"] === "Import preview")).toBeUndefined();
  expect(find(renderB(), n => n.props.type === "checkbox")).toBeUndefined();
});
