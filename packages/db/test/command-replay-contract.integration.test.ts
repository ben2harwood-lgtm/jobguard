import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { jobMutationRegistry, watchdogCommandGuards, watchdogRoutineGuards } from "@jobguard/core";
import { readFileSync } from "node:fs";
import { lp5RegistryRows } from "./lp5-command-catalog.js";
import { PurchaseOrderActionRepository } from "../src/purchase-order-action-repository.js";
import { createWatchdogHarness } from "./watchdog-command-harness.js";

// CH-2 Done-when, applied to EVERY watchdog_live_only command: once a command succeeds, replaying its id returns the first
// result (never the job's current state), the same id with a changed payload conflicts, the same id on another job conflicts,
// and a successful no-op keeps its identity. The command list is generated from the registry: a live-only registry key or a
// guarded command that no case covers fails this file, so a new or missed command cannot pass unnoticed.
const h = createWatchdogHarness("replay-contract", 61000);
const { caseKeys, live, probeJob, norm, CONFLICT } = h;
// These dark commands have no route/source guard entry. Exercise their real repository
// boundaries here without adding post-0606 facts to the pre-0096 legacy-id harness.
const darkCases: typeof h.cases = [
  { key: "purchase-order-action-repository.ts#attestManual", registry: ["command:purchase_order.attest_manual"],
    prepare: async job => { await h.pre.order(job); },
    run: async (job, id, variant) => new PurchaseOrderActionRepository(h.observed.pool).attestManual(h.ctx, {
      version: "manual-order-attestation.v1", jobId: job, revisionId: h.st(job).order.id, commandId: id,
      supplierReference: `synthetic-${id}${variant === "changed" ? "-changed" : ""}`,
    }, h.member),
    later: async job => { await h.repos.po.revise(h.ctx, job, h.orderInput(h.st(job).requirement, 1, randomUUID(), "12")); } },
  { key: "purchase-order-action-repository.ts#approve", registry: ["command:purchase_order.send.dark"],
    prepare: async job => {
      await h.pre.order(job);
      h.st(job).darkPreview = await new PurchaseOrderActionRepository(h.observed.pool).preview(h.ctx,
        { version: "merchant-order-scope.v1", jobId: job, revisionId: h.st(job).order.id });
    },
    run: async (job, id, variant) => {
      const order = h.st(job).order, preview = h.st(job).darkPreview;
      return new PurchaseOrderActionRepository(h.observed.pool).approve(h.ctx,
        { version: "merchant-order-scope.v1", jobId: job, revisionId: order.id },
        { version: "command.v1", commandId: id, authorizationId: `a${id.slice(1)}`,
          commandType: "purchase_order.send.dark", semanticKey: `merchant-order:${job}:${order.id}`,
          actorMembershipId: h.member, subjectType: "purchase_order", subjectRef: order.id,
          action: { actionType: "purchase_order.send.dark", recipient: preview.order.recipient,
            contentHash: preview.contentHash, aggregateRevision: order.revision,
            amountPence: preview.amountPence + (variant === "changed" ? 1 : 0), currency: "GBP",
            policyVersion: "dark-merchant-order.v1", expiresAt: new Date("2099-01-01T00:00:00Z") } });
    },
    later: async job => { await h.repos.po.revise(h.ctx, job, h.orderInput(h.st(job).requirement, 1, randomUUID(), "12")); } },
];
const cases = [...h.cases, ...darkCases];
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); await h.boot(); }, 120000);
afterAll(async () => { await h.stop(); vi.unstubAllEnvs(); });

describe("every watchdog_live_only command is covered by this contract", () => {
  it("reconciles every dispatcher database registry key with watchdog.ts", () => {
    const seeds = ["0521_lp5a_commands.sql", "0522_lp5b_writers.sql"].map(file =>
      readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8").split("INSERT INTO app.command_type_registry VALUES")[1]!.split(";")[0]!).join("\n");
    const keys = [...seeds.matchAll(/\('([^']+)','([^']+)'/g)].map(m => `${m[1]}:${m[2]}`).sort();
    expect(keys).toEqual(lp5RegistryRows.map(r => `${r.command_type}:${r.version}`).sort());
    for (const row of lp5RegistryRows) expect(jobMutationRegistry[`command:${row.command_type}`]).toBeDefined();
  });

  it("has a case for every guarded command (the registry's command list)", () => {
    expect(caseKeys.slice().sort()).toEqual([...watchdogCommandGuards, ...watchdogRoutineGuards].map(entry => `${entry.file}#${entry.method}`).sort());
  });
  it("covers every watchdog_live_only registry key (web routes, dynamic actions, commands and Nest routes), and no stale key", () => {
    const liveOnly = Object.entries(jobMutationRegistry).filter(([, phase]) => phase === "watchdog_live_only").map(([key]) => key).sort();
    const covered = new Set(cases.flatMap(c => c.registry));
    expect(liveOnly.filter(key => !covered.has(key))).toEqual([]);
    expect([...covered].filter(key => !liveOnly.includes(key)).sort()).toEqual([]);
  });
});

describe("CH-2 replay contract for each watchdog_live_only command", () => {
  it.each(cases.map(c => [c.key, c] as const))("%s", async (_key, c) => {
    const a = await live(), b = await live();
    await c.prepare(a); await c.prepare(b);
    const id = randomUUID(), first = norm(await c.run(a, id, "base"));
    let noopId: string | undefined, noopFirst: unknown;
    if (c.noop) { noopId = randomUUID(); noopFirst = norm(await c.noop(a, noopId, "base")); }
    await c.later(a);
    // First result, not current state, even after the job has moved on.
    expect(norm(await c.run(a, id, "base"))).toEqual(first);
    // An exact retry whose server-generated fields differ replays the same result.
    for (const retry of c.retries ?? []) expect(norm(await c.run(a, id, retry))).toEqual(first);
    // Same id, changed payload; same id, another job.
    for (const change of ["changed", ...(c.moreChanges ?? [])]) await expect(c.run(a, id, change)).rejects.toThrow(CONFLICT);
    await expect(c.run(b, id, "base")).rejects.toThrow(CONFLICT);
    if (c.noop) {
      // A successful no-op keeps its identity.
      expect(norm(await c.noop(a, noopId!, "base"))).toEqual(noopFirst);
      await expect(c.noop(a, noopId!, "changed")).rejects.toThrow(CONFLICT);
      await expect(c.noop(b, noopId!, "base")).rejects.toThrow(CONFLICT);
    }
    // Same id, another KIND of command: all share one tenant-wide identity, whichever store holds the result.
    for (const other of cases) {
      if (other === c) continue;
      const foreign = await probeJob(other);
      await expect(other.run(foreign, id, "base"), `${other.key} must not run with ${c.key}'s id`).rejects.toThrow(CONFLICT);
      if (noopId) await expect(other.run(foreign, noopId, "base"), `${other.key} must not run with ${c.key}'s no-op id`).rejects.toThrow(CONFLICT);
    }
    // The failed attempts changed nothing, and the id still replays on the first job.
    expect(norm(await c.run(a, id, "base"))).toEqual(first);
  }, 240000);

  // The claim is atomic: two commands racing for one id, in different kinds or on different jobs, leave exactly one winner.
  it.each(cases.map((c, index) => [c.key, c, cases[(index + 1) % cases.length]!] as const))("%s races another kind for one id", async (_key, c, partner) => {
    const mine = await live(), theirs = await live();
    await c.prepare(mine); await partner.prepare(theirs);
    const id = randomUUID(), outcomes = await Promise.allSettled([c.run(mine, id, "base"), partner.run(theirs, id, "base")]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const lost = outcomes.find(outcome => outcome.status === "rejected") as PromiseRejectedResult;
    expect(String(lost.reason)).toMatch(CONFLICT);
  }, 240000);

  it.each(cases.map(c => [c.key, c] as const))("%s: parallel duplicates of one command replay one result", async (_key, c) => {
    const job = await live(); await c.prepare(job);
    const id = randomUUID(), results = await Promise.all([1, 2, 3].map(() => c.run(job, id, "base")));
    for (const result of results) expect(norm(result)).toEqual(norm(results[0]));
  }, 240000);
});
