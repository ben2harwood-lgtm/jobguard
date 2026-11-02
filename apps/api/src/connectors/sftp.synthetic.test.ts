import { describe, expect, it, vi } from "vitest";
import { renderBillingExport } from "@jobguard/core";
import type { OutboundAction } from "@jobguard/db";
import { createInMemorySftpServer } from "./sftp.synthetic.js";

const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const environment = { CONNECTOR_CONFIG_VERSION: "connector-environment.v1", JOBGUARD_ENV: "synthetic_demo",
  CONNECTOR_ENDPOINT_KIND: "fake", CONNECTOR_ENDPOINT_REF: "fixture:server", CONNECTOR_CREDENTIAL_REF: "fixture:key1" };
const scope = { version: "sftp-fixture-scope.v1", tenantId: id(1), clientContractId: id(2),
  operations: ["work_orders", "billing_status", "materials_issues", "export_delivery"], maxBytes: 100000 };
function action(): OutboundAction {
  const artifact = renderBillingExport({ version: "billing-export.v1", clientContractId: id(2), lines: [{
    jobId: id(3), extraId: id(4), scopeItemId: id(5), revisionId: id(6), revisionHash: "a".repeat(64),
    approvalBindingId: id(7), approvalSnapshotHash: "b".repeat(64), description: "Fictional item", quantity: "1",
    unit: "item", priceProvenance: "server_sor", approvedNet: { pence: 12000, currency: "GBP" },
  }] });
  return { version: "outbound-action.v1", id: id(8), authorizationId: id(9), adapter: "fake_sftp",
    providerEffectKey: "fixture:effect", actionType: "billing_export", recipient: "fictional.invalid",
    immutableContent: artifact.json, contentHash: artifact.jsonHash, aggregateRevision: 1, amountPence: 12000,
    currency: "GBP", policyVersion: "fixture.v1", authorizationExpiresAt: new Date("2026-12-01T00:00:00Z") };
}
const material = { version: "materials-issue.v1", commandId: id(10), jobId: id(3), sourceId: "fixture:source",
  eventId: "fixture:event", workIdentity: "fictional-work", unit: "each", quantity: "2", occurredAtMicros: "1", kind: "issue" };
const order = { version: "work-order-import.v1", contractId: id(2), workOrderReference: "fictional-order", issuedOn: "2026-10-01",
  dueOn: null, priority: "routine", status: "ordered", expectedRevision: 0, teamId: null, assignedMembershipIds: [],
  lines: [{ clientLineReference: "fictional-line", sorCode: "F1", quantity: "1" }] };
const billing = { version: "billing-status.v1", source: "fictional-ledger", sourceEventId: "invoice-1", clientContractId: id(2),
  invoiceNumber: "INV-1", factType: "invoiced", effectiveAt: "2026-10-01T00:00:00Z", remittanceReference: null,
  reconciliationId: null, originalEventId: null, amount: { netPence: 12000, vatPence: 2400, grossPence: 14400 },
  composition: { declared: { netPence: 12000, vatPence: 2400, grossPence: 14400 }, lines: [{ externalInvoiceLineId: "order",
    kind: "original_order", existedAt: "2026-10-01T00:00:00Z", netPence: 12000, vatPence: 2400, grossPence: 14400, match: null }] },
  explicit: null, separateInvoice: false };
function file(operation = "materials_issues", payload: unknown = material) {
  return { version: "sftp-fixture-file.v1", tenantId: id(1), clientContractId: id(2), operation,
    source: "fixture:source", eventId: "fixture:event", payload };
}

describe("dark SFTP transport seam (no machine principal or domain writes)", () => {
  it("refuses live configuration, credentials, paths and capability escalation", async () => {
    const server = createInMemorySftpServer(new Map([[id(2), id(1)]]));
    for (const patch of [{ JOBGUARD_ENV: "production" }, { CONNECTOR_ENDPOINT_KIND: "sftp" },
      { CONNECTOR_ENDPOINT_REF: "sftp://real.example" }, { CONNECTOR_CREDENTIAL_REF: "private-secret" }]) {
      expect(() => server.connect({ ...environment, ...patch }, scope)).toThrow("invalid or unavailable");
    }
    for (const op of ["approve", "price", "write_origin", "read_statements", "shadow"]) {
      expect(() => server.connect(environment, { ...scope, operations: [op] })).toThrow("SFTP_INVALID");
    }
    const client = server.connect(environment, { ...scope, operations: ["work_orders"] });
    await expect(client.pull("fixture:file", "materials_issues")).rejects.toThrow("SFTP_FORBIDDEN");
    await expect(client.adapter.deliver(action())).rejects.toThrow("SFTP_FORBIDDEN");
    await expect(client.pull("../secrets", "work_orders")).rejects.toThrow("SFTP_INVALID");
  });

  it("pulls work-order and materials proposals; renamed and rotated replays retain identity", async () => {
    const server = createInMemorySftpServer(new Map([[id(2), id(1)]])), client = server.connect(environment, scope);
    server.seed("fixture:order", JSON.stringify(file("work_orders", order)));
    expect((await client.pull("fixture:order", "work_orders")).payload).toMatchObject({ status: "ordered" });
    server.seed("fixture:a", JSON.stringify(file()));
    expect((await client.pull("fixture:a", "materials_issues")).replayed).toBe(false);
    server.seed("fixture:renamed", JSON.stringify(file()));
    const rotated = server.connect({ ...environment, CONNECTOR_CREDENTIAL_REF: "fixture:key2" }, scope);
    expect((await rotated.pull("fixture:renamed", "materials_issues")).replayed).toBe(true);
    server.seed("fixture:conflict", JSON.stringify(file("materials_issues", { ...material, quantity: "3" })));
    await expect(client.pull("fixture:conflict", "materials_issues")).rejects.toThrow("SFTP_CONFLICT");
    expect((await client.pull("fixture:a", "materials_issues")).payload).toEqual(material);
  });

  it("preserves reordered corrections as proposals; never settles, allocates or changes a locked bill", async () => {
    const server = createInMemorySftpServer(new Map([[id(2), id(1)]])), client = server.connect(environment, scope);
    const correction = { ...file("materials_issues", { ...material, eventId: "fixture:return", kind: "return", quantity: "1" }), eventId: "fixture:return" };
    server.seed("fixture:return", JSON.stringify(correction));
    server.seed("fixture:issue", JSON.stringify(file()));
    expect((await client.pull("fixture:return", "materials_issues")).payload).toMatchObject({ kind: "return" });
    expect((await client.pull("fixture:issue", "materials_issues")).payload).toMatchObject({ kind: "issue" });
    server.seed("fixture:locked", JSON.stringify(file("materials_issues", { ...material, lockedBillId: id(20) })));
    await expect(client.pull("fixture:locked", "materials_issues")).rejects.toThrow("SFTP_INVALID");
  });

  it("pulls billing status through the existing parser; reordered facts replay, changed facts conflict", async () => {
    const server = createInMemorySftpServer(new Map([[id(2), id(1)]])), client = server.connect(environment, scope);
    const second = { ...billing, sourceEventId: "invoice-2", invoiceNumber: "INV-2" };
    const input = file("billing_status", { version: "billing-import.v1", transport: "api", events: [billing, second] });
    server.seed("fixture:billing", JSON.stringify(input));
    expect((await client.pull("fixture:billing", "billing_status")).replayed).toBe(false);
    server.seed("fixture:billing", JSON.stringify({ ...input, payload: { ...input.payload as object,
      events: [second, billing] } }, null, 2));
    expect((await client.pull("fixture:billing", "billing_status")).replayed).toBe(true);
    server.seed("fixture:billing", JSON.stringify(file("billing_status", { version: "billing-import.v1", transport: "api",
      events: [{ ...billing, invoiceNumber: "CHANGED" }] })));
    await expect(client.pull("fixture:billing", "billing_status")).rejects.toThrow("SFTP_CONFLICT");
    server.seed("fixture:invalid", JSON.stringify(file("billing_status", { version: "billing-import.v1", transport: "api",
      events: [{ ...billing, amount: { netPence: -1, vatPence: 0, grossPence: -1 } }] })));
    await expect(client.pull("fixture:invalid", "billing_status")).rejects.toThrow("SFTP_INVALID");
    server.seed("fixture:foreign", JSON.stringify(file("billing_status", { version: "billing-import.v1", transport: "api",
      events: [{ ...billing, clientContractId: id(99) }] })));
    await expect(client.pull("fixture:foreign", "billing_status")).rejects.toThrow("SFTP_FORBIDDEN");
  });

  it("refuses cross-tenant/contract files before parsing or returning hidden payload", async () => {
    const server = createInMemorySftpServer(new Map([[id(2), id(1)]])), client = server.connect(environment, scope);
    for (const patch of [{ tenantId: id(99) }, { clientContractId: id(99) }]) {
      server.seed("fixture:foreign", JSON.stringify({ ...file(), ...patch, payload: { secret: "hidden" } }));
      await expect(client.pull("fixture:foreign", "materials_issues")).rejects.toThrow("SFTP_FORBIDDEN");
    }
    server.seed("fixture:origin", JSON.stringify(file("work_orders", { ...order, origin: "site" })));
    await expect(client.pull("fixture:origin", "work_orders")).rejects.toThrow("SFTP_INVALID");
    server.seed("fixture:contract", JSON.stringify(file("work_orders", { ...order, contractId: id(99) })));
    await expect(client.pull("fixture:contract", "work_orders")).rejects.toThrow("SFTP_FORBIDDEN");
  });

  it("rejects malformed, oversized UTF-8, unknown and invalid input without consuming event identity", async () => {
    const server = createInMemorySftpServer(new Map([[id(2), id(1)]])), client = server.connect(environment, scope);
    for (const bytes of ["{", JSON.stringify({ ...file(), shadow: true }), JSON.stringify(file("materials_issues", { ...material, quantity: "-1" }))]) {
      server.seed("fixture:bad", bytes);
      await expect(client.pull("fixture:bad", "materials_issues")).rejects.toThrow("SFTP_INVALID");
    }
    server.seed("fixture:big", "é".repeat(60000));
    await expect(client.pull("fixture:big", "materials_issues")).rejects.toThrow("SFTP_INVALID");
    server.seed("fixture:valid", JSON.stringify(file()));
    expect((await client.pull("fixture:valid", "materials_issues")).replayed).toBe(false);
  });

  it.each(["success", "unknown_accepted", "unknown_absent", "unknown_unresolved"] as const)("push/reconcile %s without blind resend, including client restart", async scenario => {
    const server = createInMemorySftpServer(new Map([[id(2), id(1)]])), client = server.connect(environment, scope, scenario), a = action();
    const first = await client.adapter.deliver(a);
    expect(first.kind).toBe(scenario === "success" ? "succeeded" : "outcome_unknown");
    const restarted = server.connect(environment, scope, scenario);
    expect(await restarted.adapter.deliver(a)).toEqual(first);
    expect(await restarted.adapter.reconcile(a.providerEffectKey)).toBe(scenario === "success" || scenario === "unknown_accepted" ? "succeeded" : scenario === "unknown_absent" ? "not_found" : "unknown");
    expect(server.simulatedEffects).toBe(scenario === "success" || scenario === "unknown_accepted" ? 1 : 0);
    await expect(restarted.adapter.deliver({ ...a, recipient: "changed.invalid" })).rejects.toThrow("SFTP_CONFLICT");
    expect(await createInMemorySftpServer(new Map([[id(2), id(1)]])).connect(environment, scope).adapter.reconcile(a.providerEffectKey)).toBe("unknown");
    const foreign = server.connect(environment, { ...scope, tenantId: id(99) });
    expect(await foreign.adapter.reconcile(a.providerEffectKey)).toBe("unknown");
    if (scenario === "unknown_unresolved") {
      expect(await server.connect(environment, scope, "unknown_absent").adapter.reconcile(a.providerEffectKey)).toBe("unknown");
    }
  });

  it("rejects oversized push bytes before parsing, without recording a delivery", async () => {
    const server = createInMemorySftpServer(new Map([[id(2), id(1)]])), a = action();
    const oversized = { ...a, immutableContent: "é".repeat(11) };
    const client = server.connect(environment, { ...scope, maxBytes: 21 });
    const parse = vi.spyOn(JSON, "parse");
    try {
      await expect(client.adapter.deliver(oversized)).rejects.toThrow("SFTP_INVALID");
      expect(parse).not.toHaveBeenCalled();
    } finally { parse.mockRestore(); }
    expect(await client.adapter.reconcile(a.providerEffectKey)).toBe("unknown");
    const exact = server.connect(environment, { ...scope, maxBytes: Buffer.byteLength(a.immutableContent) });
    expect((await exact.adapter.deliver(a)).kind).toBe("succeeded");
    expect(server.simulatedEffects).toBe(1);
  });

  it("rejects foreign or missing artifact ownership before first push and replay", async () => {
    const owners = new Map([[id(2), id(1)]]), server = createInMemorySftpServer(owners), a = action();
    // Mutating harness input cannot reassign the fake server's ownership snapshot.
    owners.set(id(2), id(99));
    const foreign = server.connect(environment, { ...scope, tenantId: id(99) });
    await expect(foreign.adapter.deliver(a)).rejects.toThrow("SFTP_FORBIDDEN");
    expect(await foreign.adapter.reconcile(a.providerEffectKey)).toBe("unknown");
    expect(server.simulatedEffects).toBe(0);
    await expect(createInMemorySftpServer().connect(environment, scope).adapter.deliver(a)).rejects.toThrow("SFTP_FORBIDDEN");
    const client = server.connect(environment, scope);
    const first = await client.adapter.deliver(a);
    await expect(foreign.adapter.deliver(a)).rejects.toThrow("SFTP_FORBIDDEN");
    expect(await client.adapter.deliver(a)).toEqual(first);
    expect(server.simulatedEffects).toBe(1);
  });

  it.each(["work_orders", "materials_issues"])("replays %s with reordered object keys and conflicts on changed values", async op => {
    const server = createInMemorySftpServer(), client = server.connect(environment, scope);
    const payload = op === "work_orders" ? order : material;
    const reverseKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(reverseKeys)
      : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)])) : value;
    server.seed("fixture:original", JSON.stringify(file(op, payload)));
    expect((await client.pull("fixture:original", op)).replayed).toBe(false);
    server.seed("fixture:reordered", JSON.stringify(reverseKeys(file(op, payload)), null, 2));
    expect((await client.pull("fixture:reordered", op)).replayed).toBe(true);
    const changed = op === "work_orders" ? { ...order, lines: [{ ...order.lines[0], quantity: "3" }] } : { ...material, quantity: "3" };
    server.seed("fixture:changed", JSON.stringify(file(op, changed)));
    await expect(client.pull("fixture:changed", op)).rejects.toThrow("SFTP_CONFLICT");
  });

  it("refuses changed artifact, amount limits, wrong contract and statement/shadow action types", async () => {
    const server = createInMemorySftpServer(new Map([[id(2), id(1)]])), client = server.connect(environment, scope), a = action();
    for (const patch of [{ amountPence: 1 }, { amountPence: Number.MAX_SAFE_INTEGER }, { amountPence: -1 },
      { immutableContent: a.immutableContent + "!" }, { actionType: "statement" }, { actionType: "shadow" }]) {
      await expect(client.adapter.deliver({ ...a, ...patch })).rejects.toThrow();
    }
    await expect(server.connect(environment, { ...scope, clientContractId: id(99) }).adapter.deliver(a)).rejects.toThrow("SFTP_FORBIDDEN");
    await expect(server.connect(environment, { ...scope, maxBytes: 10 }).adapter.deliver(a)).rejects.toThrow("SFTP_INVALID");
    expect(server.simulatedEffects).toBe(0);
  });
});
