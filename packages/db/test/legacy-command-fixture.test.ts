import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as commands from "../src/commands.js";
import { legacyCommandModule } from "./legacy-command-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const id = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.restoreAllMocks());
describe("test-only partial migration dispatcher routing", () => {
  it.each([
    { begin_installed: true, complete_installed: true, claims_installed: true },
    { begin_installed: false, complete_installed: true, claims_installed: false },
    { begin_installed: true, complete_installed: false, claims_installed: false },
    { begin_installed: false, complete_installed: false, claims_installed: true },
    undefined,
  ])("keeps current or damaged schemas on the fail-closed production client: %j", async row => {
    const dispatch = vi.spyOn(commands.UserCommandDispatcher.prototype, "dispatch").mockRejectedValue(new Error("production refusal"));
    const dismiss = vi.spyOn(commands.UserCommandDispatcher.prototype, "dismissDecision").mockRejectedValue(new Error("production refusal"));
    const pool = { query: vi.fn().mockResolvedValue({ rows: row ? [row] : [] }) } as unknown as Pool;
    const { UserCommandDispatcher } = legacyCommandModule(commands), client = new UserCommandDispatcher(pool);
    await expect(client.dispatch(testTenantContext(id), {}, { mutate: async () => ({}) })).rejects.toThrow("production refusal");
    await expect(client.dismissDecision(testTenantContext(id), {})).rejects.toThrow("production refusal");
    expect(dispatch).toHaveBeenCalledOnce(); expect(dismiss).toHaveBeenCalledOnce();
  });
  it("uses the historical receipt protocol only when every LP-5a marker is absent", async () => {
    const sql: string[] = [];
    const current = vi.spyOn(commands.UserCommandDispatcher.prototype, "dispatch");
    const pool = {
      query: async () => ({ rows: [{ begin_installed: false, complete_installed: false, claims_installed: false }] }),
      connect: async () => ({ release() {}, query: async (query: string) => {
        sql.push(query);
        if (query.includes("FROM app.membership")) return { rows: [{ role: "owner" }], rowCount: 1 };
        if (query.startsWith("INSERT INTO app.command_receipt")) return { rows: [{ command_id: id }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      } }),
    } as unknown as Pool;
    const { UserCommandDispatcher } = legacyCommandModule(commands);
    // No audit input in this protocol-only double; real PostgreSQL historical
    // audits are covered by the existing schema-aware audit fixture.
    const audit = await import("../src/audit.js");
    vi.spyOn(audit, "appendAuditBatch").mockResolvedValue([]);
    const command = { version: "command.v1", commandId: id, commandType: "quote.send", semanticKey: "historical",
      actorMembershipId: id, subjectType: "job", subjectRef: id,
      action: { actionType: "quote.send", recipient: null, contentHash: "a".repeat(64), aggregateRevision: 0,
        amountPence: null, currency: null, policyVersion: "historical.test", expiresAt: new Date("2099-01-01") } };
    await expect(new UserCommandDispatcher(pool).dispatch(testTenantContext(id), command, { mutate: async () => ({ historical: true }) })).resolves.toEqual({ historical: true });
    expect(current).not.toHaveBeenCalled();
    expect(sql.some(query => query.startsWith("INSERT INTO app.command_receipt"))).toBe(true);
    expect(sql.some(query => query.includes("app.begin_command"))).toBe(false);
  });
  it("propagates catalogue errors without attempting either dispatch protocol", async () => {
    const current = vi.spyOn(commands.UserCommandDispatcher.prototype, "dispatch");
    const pool = { query: async () => { throw new Error("catalogue unavailable"); }, connect: vi.fn() } as unknown as Pool;
    const { UserCommandDispatcher } = legacyCommandModule(commands);
    await expect(new UserCommandDispatcher(pool).dispatch(testTenantContext(id), {}, { mutate: async () => ({}) })).rejects.toThrow("catalogue unavailable");
    expect(current).not.toHaveBeenCalled(); expect(pool.connect).not.toHaveBeenCalled();
  });
});
