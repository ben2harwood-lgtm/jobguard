import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { watchdogCommandGuards } from "@jobguard/core";
import { appendAuditBatch, requireLiveJob, withTenant } from "../src/index.js";
import { analyseLockOrder, mutableTables, type ObservedTransaction, type Ownership } from "./lock-observer.js";
import { createWatchdogHarness } from "./watchdog-command-harness.js";

// CH-2 Done-when: "The M0-8 command-layer lock-order test is extended to the guarded commands and shows no business lock after the
// audit append." This runs every one of the 17 guarded commands (generated from the registry, through their real repositories as the
// real runtime role) with a lock observer on their connections, and reads what each transaction holds after each statement:
//   1. the first business lock a transaction takes is the share lock on the job row, the live guard (so a transition out of live,
//      which locks the job row for update, serialises with every watchdog command);
//   2. once a transaction holds the tenant's audit head row, it takes no further contending lock: no row lock on a row that can be
//      locked for update by anything, no advisory lock, and no table lock above ROW EXCLUSIVE. Everything it takes is declared.
// "Business lock" here means a lock another transaction could hold while waiting for the audit head, which is what a lock-order
// deadlock needs. A foreign-key check takes KEY SHARE on the rows it references; on a row of an append-only table (the runtime role
// has no UPDATE grant on it and no SECURITY DEFINER routine updates, deletes or locks it for update) nothing can ever hold a conflicting
// lock, so those are listed as tolerated, not counted. A row of any mutable table, or any stronger lock, is counted.
const h = createWatchdogHarness("lock-order", 61500);
const { cases, live } = h;
let ownership: Ownership;
beforeAll(async () => { await h.boot(); ownership = { mutable: await mutableTables(h.admin) }; }, 120000);
const toleratedByCommand = new Map<string, Set<string>>();
afterAll(async () => { for (const [key, tolerated] of toleratedByCommand) console.info(`lock-order ${key}: tolerated after audit (KEY SHARE on append-only rows): ${[...tolerated].join(" | ") || "none"}`); await h.stop(); });

const jobLock = async (job: string) => `app.job#${(await h.admin.query<{ c: string }>("SELECT ctid::text AS c FROM app.job WHERE id=$1", [job])).rows[0]!.c}`;
const auditCount = async () => Number((await h.admin.query("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1", [h.tenant])).rows[0].n);

/** The two rules, for one recorded transaction. */
async function expectGuardedOrder(label: string, transaction: ObservedTransaction, job: string, key?: string) {
  const analysis = analyseLockOrder(transaction, ownership);
  const guard = await jobLock(job);
  expect(analysis.firstLocks.map(lock => ({ key: lock.key, strength: lock.rank })), `${label}: the first business lock must be the job row's share lock; it was taken by: ${analysis.firstStatement}`).toEqual([{ key: guard, strength: 2 }]);
  expect(analysis.firstStatement, `${label}: the first lock must come from the live guard routine`).toMatch(/require_watchdog_live/u);
  expect(analysis.afterAudit.map(violation => `${violation.statement} => ${violation.locks.join(", ")}`), `${label}: contending locks acquired after the audit head`).toEqual([]);
  expect(analysis.strongTableLocks, `${label}: table locks above ROW EXCLUSIVE`).toEqual([]);
  if (key) { const set = toleratedByCommand.get(key) ?? new Set<string>(); for (const lock of analysis.tolerated) set.add(lock.replace(/#\(\d+,\d+\)$/u, "")); toleratedByCommand.set(key, set); }
  return analysis;
}

describe("the lock observer itself (it must be able to fail)", () => {
  const event = (job: string) => ({ id: randomUUID(), version: "audit.v1" as const, actorRef: "system:lock-order-test", eventType: "lock_order.probe", subjectType: "job", subjectRef: job, payload: { references: { jobId: job }, classifications: { action: "operational" as const } } });
  const record = (work: (db: Parameters<Parameters<typeof withTenant>[2]>[0], job: string) => Promise<void>) => live().then(async job => ({ job, ...(await h.observed.record(() => withTenant(h.observed.pool, h.ctx, db => work(db, job)))) }));

  it("passes a transaction that takes the job guard first and the audit head last", async () => {
    const { job, transactions } = await record(async (db, id) => { await requireLiveJob(db, id); await appendAuditBatch(db, [event(id)]); });
    expect(transactions).toHaveLength(1);
    const analysis = await expectGuardedOrder("clean", transactions[0]!, job);
    expect(analysis.auditIndex).toBeDefined();
  });
  it("reports an advisory lock taken after the audit append", async () => {
    const { transactions } = await record(async (db, id) => { await requireLiveJob(db, id); await appendAuditBatch(db, [event(id)]); await db.$client.query("SELECT pg_advisory_xact_lock(424242)"); });
    const analysis = analyseLockOrder(transactions[0]!, ownership);
    expect(analysis.afterAudit.map(violation => violation.locks).flat().join()).toMatch(/advisory/u);
  });
  it("reports a row lock on a mutable row taken after the audit append", async () => {
    const receipt = randomUUID();
    await h.admin.query("INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)VALUES($1,$2,'lock_order.probe',$3,$4,'processing',$5)", [receipt, h.tenant, `probe:${receipt}`, "a".repeat(64), h.member]);
    const { transactions } = await record(async (db, id) => { await requireLiveJob(db, id); await appendAuditBatch(db, [event(id)]); await db.$client.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2 FOR UPDATE", [h.tenant, receipt]); });
    const analysis = analyseLockOrder(transactions[0]!, ownership);
    expect(analysis.afterAudit.map(violation => violation.locks).flat().join()).toMatch(/UPDATE app\.command_receipt#/u);
  });
  it("reports a first business lock that is not the job guard", async () => {
    const { job, transactions } = await record(async (db, id) => { await db.$client.query("SELECT pg_advisory_xact_lock(777)"); await requireLiveJob(db, id); });
    const analysis = analyseLockOrder(transactions[0]!, ownership);
    expect(analysis.firstLocks.some(lock => lock.advisory)).toBe(true);
    await expect(expectGuardedOrder("advisory first", transactions[0]!, job)).rejects.toThrow();
  });
});

describe("every guarded command: the job share lock first, no contending lock after the audit append", () => {
  it("has a case for every guarded command in the registry", () => {
    expect(cases.map(c => c.key).sort()).toEqual(watchdogCommandGuards.map(entry => `${entry.file}#${entry.method}`).sort());
  });

  it.each(cases.map(c => [c.key, c] as const))("%s", async (key, c) => {
    const job = await live(); await c.prepare(job);
    const id = randomUUID();
    const auditBefore = await auditCount();
    // The command succeeding for the first time, then the same command replayed, then the same id refused for a changed payload.
    const runs = [
      { label: "first run", ...(await h.observed.record(() => c.run(job, id, "base"))) },
      { label: "replay", ...(await h.observed.record(() => c.run(job, id, "base"))) },
      { label: "changed payload", ...(await h.observed.record(() => c.run(job, id, "changed").then(() => "accepted", error => error as Error))) },
    ];
    const audited = (await auditCount()) > auditBefore;
    expect(runs[2]!.value, `${key}: the same id with a changed payload must be refused`).toBeInstanceOf(Error);
    let observedAudit = false;
    for (const run of runs) {
      expect(run.transactions.length, `${key} ${run.label}: no transaction was observed`).toBeGreaterThan(0);
      for (const [index, transaction] of run.transactions.entries()) {
        const analysis = await expectGuardedOrder(`${key} ${run.label} transaction ${index + 1}`, transaction, job, key);
        if (run.label === "first run" && analysis.auditIndex !== undefined) observedAudit = true;
      }
    }
    // The audit rule is not vacuous: a command that appended audit events must have been seen holding the audit head.
    expect(observedAudit, `${key}: audit events were appended, so the observer must have seen the audit head lock`).toBe(audited);
  }, 240000);

  it("proof completion: both of its transactions are observed, the second holds the audit head and takes nothing after it", async () => {
    const c = cases.find(entry => entry.key === "proof-repository.ts#complete")!;
    const job = await live(); await c.prepare(job);
    const { transactions } = await h.observed.record(() => c.run(job, randomUUID(), "base"));
    const committed = transactions.filter(transaction => transaction.outcome === "commit");
    expect(committed).toHaveLength(2);
    const [read, write] = await Promise.all(committed.map((transaction, index) => expectGuardedOrder(`proof.complete transaction ${index + 1}`, transaction, job)));
    expect(read!.auditIndex).toBeUndefined();
    expect(write!.auditIndex).toBeDefined();
  }, 120000);
});
