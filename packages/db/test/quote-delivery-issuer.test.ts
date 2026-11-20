import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { VerifiedTenantContext } from "../src/tenant-context.js";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";

const state = vi.hoisted(() => ({ query: vi.fn(), mutate: vi.fn(), replay: false }));
vi.mock("../src/tenant-context.js", () => ({
 withTenant: async (_pool: unknown, _context: unknown, work: (db: unknown) => unknown) => work({ $client: { query: state.query } }),
}));
vi.mock("../src/quote-document-repository.js", () => ({
 IssueQuoteMutation: class { lock = vi.fn(); mutate = state.mutate; },
}));
vi.mock("../src/commands.js", () => ({
 UserCommandDispatcher: class {
  async dispatch(_context: unknown, command: unknown, handler: { lock: (db: unknown, command: unknown) => Promise<void>; mutate: (db: unknown, command: unknown) => Promise<unknown> }) {
   const db = { $client: { query: state.query } };
   await handler.lock(db, command);
   if (!state.replay) return handler.mutate(db, command);
  }
 },
}));
const jobId = randomUUID(), documentId = randomUUID(), bindingId = randomUUID();
const recipient = "customer@fictional.invalid", hash = "a".repeat(64);
const issuer = { name: "Fictional supplied builder", address: ["1 Fictional Road"], email: "builder@example.invalid" };
const document = { schemaVersion: "quote-document.v1", documentVersion: 1, reference: "Q-0001", quoteRevisionId: randomUUID(), currency: "GBP", issuer,
 customer: { name: "Fictional customer", address: ["2 Fictional Road"], email: recipient },
 lines: [{ scopeItemId: randomUUID(), description: "Fit cabinet", quantity: "1", unit: "item", netPence: 10000 }],
 exclusions: [], qualifications: [], subtotalPence: 10000, discountPence: 0, netPence: 10000, taxPence: 2000, totalPence: 12000 };
let profile: null | { trading_name: string; address_lines: string[]; contact_email: string; contact_phone: string };
let prior: boolean;
let delivery: QuoteDeliveryRepository;
const send = () => delivery.issue({ tenantId: randomUUID() } as VerifiedTenantContext, jobId, { documentId, contentHash: hash, recipient, commandId: randomUUID() });
beforeEach(() => {
 vi.clearAllMocks(); profile = null; prior = false; state.replay = false;
 state.mutate.mockResolvedValue({ documentId, state: "issued" });
 state.query.mockImplementation(async (sql: string) => {
  if (sql.includes("SELECT d.content_hash")) return { rows: [{ content_hash: hash, document_version: 1, snapshot: document, binding_id: bindingId, current_binding_id: bindingId }] };
  if (sql.includes("FROM app.quote_send")) return { rows: prior ? [{ content_hash: hash, recipients: [recipient] }] : [] };
  if (sql.includes("to_reg")) return { rows: [{ present: true }] };
  if (sql.includes("SELECT trading_name")) return { rows: profile ? [profile] : [] };
  if (sql.includes("job_saved_firm_name")) return { rows: [{ name: profile?.trading_name ?? null, company_key: "practice:fictional" }] };
  if (sql.includes("current_firm_profile_key() key")) return { rows: [{ key: "practice:fictional", tenant: "fictional" }] };
  if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
  throw new Error(`Unexpected query: ${sql}`);
 });
 delivery = new QuoteDeliveryRepository({} as Pool);
 vi.spyOn(delivery, "view").mockResolvedValue(null);
});
it("allows a normal first send with a supplied legacy issuer and no saved profile", async () => {
 await expect(send()).resolves.toBeNull();
 expect(state.mutate).toHaveBeenCalledOnce();
});
it("allows an unchanged saved issuer on a first send", async () => {
 profile = { trading_name: issuer.name, address_lines: issuer.address, contact_email: issuer.email, contact_phone: "" };
 await expect(send()).resolves.toBeNull();
 expect(state.mutate).toHaveBeenCalledOnce();
});
it("refuses a genuinely changed saved issuer under the profile lock", async () => {
 profile = { trading_name: "Fictional renamed builder", address_lines: issuer.address, contact_email: issuer.email, contact_phone: "" };
 await expect(send()).rejects.toThrow("QUOTE_CHANGED");
 const lock = state.query.mock.calls.findIndex(([sql]) => String(sql).includes("pg_advisory_xact_lock"));
 const read = state.query.mock.calls.findIndex(([sql]) => String(sql).includes("SELECT trading_name"));
 expect(lock).toBeGreaterThanOrEqual(0); expect(read).toBeGreaterThan(lock);
});
it("preserves the exact existing issuability refusal before a changed issuer refusal", async () => {
 profile = { trading_name: "Fictional renamed builder", address_lines: [], contact_email: "", contact_phone: "" };
 const refusal = Object.assign(new Error("QUOTE_NOT_ISSUABLE"), { code: "QUOTE_NOT_ISSUABLE", blockers: [{ code: "missing_scope", scopeItemId: randomUUID() }] });
 state.mutate.mockRejectedValue(refusal);
 await expect(send()).rejects.toBe(refusal);
});
it("replays an issued immutable artifact after a rename without reading today's issuer", async () => {
 prior = true; state.replay = true;
 profile = { trading_name: "Fictional renamed builder", address_lines: [], contact_email: "", contact_phone: "" };
 await expect(send()).resolves.toBeNull();
 expect(state.mutate).not.toHaveBeenCalled();
 expect(state.query.mock.calls.some(([sql]) => String(sql).includes("SELECT trading_name"))).toBe(false);
});
