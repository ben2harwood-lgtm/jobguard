import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
// Inspect the shell's actual React remount key, using the existing host-double approach.
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>(),
 useState: <T,>(initial: T) => [initial, vi.fn()] }));
vi.mock("react-native", () => ({ SafeAreaView: "SafeAreaView", View: "View", Text: "Text", ScrollView: "ScrollView", TextInput: "TextInput", Button: "Button" }));
vi.mock("./native-store", () => ({ openNativeStore: vi.fn() }));
import App from "../App";
import { NativeComposition, type NativeCompositionInputs } from "./composition";
import { CoreLoopScreen } from "./CoreLoopScreen";
import { WorkspaceScreens } from "./WorkspaceScreens";
import { localData, type MobileSession, type Partition } from "./lifecycle-contracts";
import type { NativeCoreSource } from "./core-loop-screens";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let fixture = 0;
function setup(hook?: (p: Partition) => Promise<void>) {
 const p = { userId: id(1), tenantId: id(2), membershipId: id(3), mobileSessionId: id(4), deviceInstanceId: `fictional-${++fixture}` };
 let bytes: string | null = null, n = 20;
 const keys = new Set<string>(), secure = new Map<string, string>();
 const store = { encryption: "sqlcipher" as const, read: async () => bytes, write: vi.fn(async (value: string) => { bytes = value; }), close: vi.fn(async () => {}) };
 const vault = { get: async (key: string) => secure.get(key) ?? null, set: async (key: string, value: string) => { secure.set(key, value); }, remove: async (key: string) => { secure.delete(key); } };
 const resources = { open: vi.fn(async () => { keys.add(p.deviceInstanceId); return store; }),
  destroy: vi.fn(async () => { bytes = null; keys.delete(p.deviceInstanceId); }) };
 const policy = { version: "mobile-auth-policy-specimen.v1", environment: "synthetic_demo", policyVersion: "fictional_mobile_auth_policy_v1", accessDurationMs: 100, refreshDurationMs: 500, sessionDurationMs: 1000, readLeaseDurationMs: 200 };
 const session: MobileSession = { version: "mobile-session.v1", environment: "synthetic_demo", partition: p,
  access: { version: "mobile-access.v1", credential: "a".repeat(43) }, refresh: { version: "mobile-refresh.v1", credential: "b".repeat(43) }, accessExpiresAtMs: 1100, refreshExpiresAtMs: 1500,
  lease: { version: "mobile-read-lease.v1", environment: "synthetic_demo", leaseId: id(8), partition: p, policyVersion: policy.policyVersion, issuedAtMs: 1000, expiresAtMs: 1200 } };
 const provider = { exchange: vi.fn(async () => session), rotate: vi.fn(async () => session), reconnect: vi.fn(async () => session.lease),
  deviceCommand: vi.fn(async () => ({ version: "mobile-device-revoked.v1", environment: "synthetic_demo" })) };
 const snapshot = { tenantId: p.tenantId, jobId: id(5), subjectId: id(6), revision: 1, contentHash: "a".repeat(64) };
 const context = { version: "core-loop-action-context.v1" as const, environment: "synthetic_demo" as const, online: true, authorized: true,
  connectionId: id(7), refreshedConnectionId: id(7), current: snapshot, review: { action: "acceptQuote" as const, connectionId: id(7), snapshot } };
 const source: NativeCoreSource = { assertCurrent: vi.fn(async () => {}), load: vi.fn(async () => ({ partition: p, context,
  request: { screen: "acceptance_intent" as const, input: context } })) };
 const inputs: NativeCompositionInputs = { partition: p, store, source, uuid: () => id(++n), online: false, authEpoch: 0,
  lifecycle: { provider, vault, resources, options: { enabled: true, environment: "synthetic_demo", policy, uuid: () => id(++n), deviceInstanceId: p.deviceInstanceId,
   clock: () => ({ status: "trusted_fixture", nowMs: 1000 }), partitionKey: async () => p.deviceInstanceId, ...(hook ? { beforePartitionCleanup: hook } : {}) } } };
 const owner = new NativeComposition(inputs);
 return { owner, inputs, p, source, provider, resources, store, secure, keys, bytes: () => bytes };
}
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
 if (Array.isArray(node)) return node.flatMap(nodes);
 if (!isValidElement<Record<string, unknown>>(node)) return [];
 return [node, ...nodes(node.props.children as ReactNode)];
}
function workspace(binding: ReturnType<typeof setup>["owner"]["binding"]) {
 return nodes(App({ native: binding })).find(node => node.type === WorkspaceScreens)!;
}
function deferred() {
 let release!: () => void;
 const promise = new Promise<void>(resolve => { release = resolve; });
 return { promise, release };
}
it("offline to online changes the shell remount key, strips restored reviews and mints a fresh connection", async () => {
 const { owner } = setup();
 const offline = owner.binding, online = owner.updateAuthority({ online: true, authEpoch: 0 });
 expect(workspace(online).key).not.toBe(workspace(offline).key);
 const first = await online.core!.load("acceptance_intent");
 expect(first.context.review).toBeNull();
 owner.updateAuthority({ online: false, authEpoch: 0 });
 const reconnected = owner.updateAuthority({ online: true, authEpoch: 0 });
 expect(workspace(reconnected).key).not.toBe(workspace(online).key);
 const second = await reconnected.core!.load("acceptance_intent");
 expect(second.context.review).toBeNull(); expect(second.context.connectionId).not.toBe(first.context.connectionId);
 await expect(online.core!.load("acceptance_intent")).rejects.toMatchObject({ code: "MOBILE_DENIED" });
});
it("online to offline remounts and hides cached commercial details and actions; offline source reads are denied", async () => {
 const f = setup(), online = f.owner.updateAuthority({ online: true, authEpoch: 0 });
 const saved = await online.core!.load("acceptance_intent");
 const offline = f.owner.updateAuthority({ online: false, authEpoch: 0 });
 expect(workspace(offline).key).not.toBe(workspace(online).key);
 const rendered = nodes(CoreLoopScreen({ screen: saved, online: offline.online, onReview: vi.fn() }));
 expect(rendered.some(node => node.type === "Button")).toBe(false);
 expect(JSON.stringify(rendered)).not.toContain(saved.context.current.contentHash);
 const calls = vi.mocked(f.source.load).mock.calls.length;
 await expect(offline.core!.load("acceptance_intent")).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 expect(vi.mocked(f.source.load).mock.calls).toHaveLength(calls);
});
it("refuses a second owner for the exact partition even with a different store", () => {
 const f = setup(); expect(() => new NativeComposition({ ...f.inputs, store: { ...f.store } })).toThrow("MOBILE_BUSY");
});
it("auth epoch changes advance generation; unchanged notifications keep it stable", () => {
 const { owner } = setup(), before = owner.binding;
 expect(owner.updateAuthority({ online: false, authEpoch: 0 }).authorityGeneration).toBe(before.authorityGeneration);
 const after = owner.updateAuthority({ online: false, authEpoch: 1 });
 expect(after.authorityGeneration).toBe(before.authorityGeneration + 1);
 expect(workspace(after).key).not.toBe(workspace(before).key);
});
it.each(["reply", "checkpoint"])("cleanup invalidates the one document before a late %s can resurrect erased data", async stage => {
 const f = setup(); await f.owner.client.exchange(f.p.tenantId);
 const entered = deferred(), finish = deferred();
 const pending = f.owner.document.transaction(async (data, checkpoint) => {
  entered.release(); await finish.promise;
  const next = { ...data, notes: [{ id: id(50), text: "Fictional late reply" }] };
  if (stage === "checkpoint") await checkpoint(next);
  return { data: next, result: null };
 });
 await entered.promise; await f.owner.client.logout();
 expect(f.resources.destroy).toHaveBeenCalledOnce(); expect(f.bytes()).toBeNull();
 const writes = f.store.write.mock.calls.length;
 const rejected = expect(pending).rejects.toMatchObject({ code: "MOBILE_DENIED" }); finish.release(); await rejected;
 expect(f.bytes()).toBeNull(); expect(f.store.write.mock.calls).toHaveLength(writes);
 await expect(f.owner.document.transaction(async data => ({ data, result: null }))).rejects.toThrow("MOBILE_DENIED");
 expect(() => f.owner.updateAuthority({ online: true, authEpoch: 1 })).toThrow("MOBILE_DENIED");
 expect(() => new NativeComposition(f.inputs)).toThrow("MOBILE_BUSY");
});
it("a source reply crossing a connectivity or cleanup boundary is rejected", async () => {
 for (const transition of ["disconnect", "auth_epoch", "cleanup"]) {
  const f = setup(); await f.owner.client.exchange(f.p.tenantId);
  const entered = deferred(), finish = deferred();
  const implementation = vi.mocked(f.source.load).getMockImplementation()!;
  vi.mocked(f.source.load).mockImplementationOnce(async (...args) => { entered.release(); await finish.promise; return implementation(...args); });
  const pending = f.owner.updateAuthority({ online: true, authEpoch: 0 }).core!.load("acceptance_intent");
  await entered.promise;
  if (transition === "cleanup") await f.owner.client.logout();
  else f.owner.updateAuthority({ online: transition === "auth_epoch", authEpoch: transition === "auth_epoch" ? 1 : 0 });
  const rejected = expect(pending).rejects.toThrow("MOBILE_DENIED"); finish.release(); await rejected;
 }
});
it("cleanup hook failure retains marker, pending contents and encryption keys while invalidating the workspace", async () => {
 const f = setup(async () => { throw new Error("fictional cleanup failure"); }); await f.owner.client.exchange(f.p.tenantId);
 await f.owner.document.transaction(async data => ({ data: localData.parse({ ...data, queue: [{ fictionalPendingIntent: true }], unsyncedWork: "present" }), result: null }));
 const pendingBytes = f.bytes();
 await expect(f.owner.client.logout()).rejects.toThrow("MOBILE_RECOVERY_REQUIRED");
 expect(f.bytes()).toBe(pendingBytes); expect(f.keys.has(f.p.deviceInstanceId)).toBe(true); expect(f.resources.destroy).not.toHaveBeenCalled();
 expect(JSON.parse(f.secure.get("jobguard.synthetic.active.v1")!)).toMatchObject({ state: "cleanup_required" });
 expect([...f.secure.keys()].some(key => key.startsWith("m32.session."))).toBe(false);
 await expect(f.owner.client.refresh()).rejects.toThrow("MOBILE_RECOVERY_REQUIRED");
 await expect(f.owner.client.reconnect()).rejects.toThrow("MOBILE_RECOVERY_REQUIRED");
 expect(f.provider.rotate).not.toHaveBeenCalled(); expect(f.provider.reconnect).not.toHaveBeenCalled();
 await expect(f.owner.document.transaction(async data => ({ data, result: null }))).rejects.toThrow("MOBILE_DENIED");
});
