import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { assertRetentionIssueAllowed, RETENTION_BALANCES_ENABLED } from "@jobguard/core";
import { RetentionRecordRepository } from "../src/retention-record-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const actor = { sessionDigest: "a".repeat(64) };
const source = { kind: "human_input", inputId: id(7) };
const profile = { version: "retention.profile.v1", revision: 1, previousProfileId: null,
 contractProfileVersion: "fictional.v1", fixtureApprovalId: id(8), taxTreatmentVersion: "fictional.v1",
 retained: { netPence: 100, taxPence: 20 }, alreadyBilled: { netPence: 0, taxPence: 0 },
 conditions: [{ id: id(6), milestone: "completion", description: "Fictional completion", source, dateSource: source,
 dueDate: "2026-11-01", cumulativeLimit: { netPence: 100, taxPence: 20 } }] };
const input = { version: "retention-record-command.v1", commandId: id(3), jobId: id(2), record: profile };
function fixture(records: unknown[] = []) {
 const query = vi.fn(async (sql: string) => ({ rows: sql.includes("app.retention_records") ? [{ result: { actorId: id(4), records, bookHash: "b".repeat(64) } }] : [] }));
 const connect = vi.fn(async () => ({ query, release: vi.fn() }));
 return { query, connect, repo: new RetentionRecordRepository({ connect } as unknown as Pool), context: testTenantContext(id(1)) };
}
describe("M4-20 retention repository", () => {
 it("stamps human sources with the session actor, using one transaction for load/core/write", async () => {
  const f = fixture(), result = await f.repo.command(f.context, actor, input);
  expect(result.book.records[0]).toMatchObject({ id: id(3), tenantId: id(1), jobId: id(2), conditions: [{ source: { actorId: id(4) }, dateSource: { actorId: id(4) } }] });
  expect(f.connect).toHaveBeenCalledOnce();
  const calls = f.query.mock.calls.filter(([sql]) => sql.includes("app.retention_records"));
  expect(calls).toHaveLength(2);
  expect(f.query).toHaveBeenLastCalledWith("COMMIT");
  expect(result.reconciliation.feeEligibleRecovery.pence).toBe(0);
 });
 it.each(["tenantId", "actorId", "enabled", "RETENTION_BALANCES_ENABLED"])("rejects payload %s before connecting", async key => {
  const f = fixture();
  await expect(f.repo.command(f.context, actor, { ...input, [key]: true })).rejects.toThrow("INVALID_RETENTION_INPUT");
  await expect(f.repo.command(f.context, actor, { ...input, record: { ...profile, [key]: true } })).rejects.toThrow("INVALID_RETENTION_INPUT");
  expect(f.connect).not.toHaveBeenCalled();
 });
 it("refuses source actor substitution", async () => {
  const f = fixture();
  await expect(f.repo.command(f.context, actor, { ...input, record: { ...profile, conditions: [{ ...profile.conditions[0], source: { ...source, actorId: id(9) } }] } })).rejects.toThrow("INVALID_RETENTION_INPUT");
  expect(f.connect).not.toHaveBeenCalled();
 });
 it("revalidates stored rows and rejects altered history, foreign context and unsupported release", async () => {
  for (const records of [[{ secret: "invalid" }], [{ ...profile, id: id(3), tenantId: id(9), jobId: id(2) }]]) {
   const f = fixture(records); await expect(f.repo.read(f.context,id(2))).rejects.toThrow();
  }
  const f = fixture();
  await expect(f.repo.command(f.context,actor,{ ...input,record:{version:"retention.release.v1",resolutionId:id(9)} })).rejects.toMatchObject({code:"RETENTION_NOT_FOUND"});
  expect(f.query.mock.calls.filter(([sql])=>sql.includes("app.retention_records"))).toHaveLength(1);
  expect(f.query).toHaveBeenLastCalledWith("ROLLBACK");
 });
 it("redacts unexpected database errors and keeps issuance disabled", async () => {
  const f = fixture(); f.query.mockImplementation(async () => { throw new Error("secret"); });
  await expect(f.repo.read(f.context,id(2))).rejects.toThrow("RETENTION_UNAVAILABLE");
  expect(RETENTION_BALANCES_ENABLED).toBe(false);
  expect(assertRetentionIssueAllowed).toThrow("disabled");
 });
});
