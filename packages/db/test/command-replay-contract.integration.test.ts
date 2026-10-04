import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jobMutationRegistry, watchdogCommandGuards } from "@jobguard/core";
import { createWatchdogHarness } from "./watchdog-command-harness.js";

// CH-2 Done-when, applied to EVERY watchdog_live_only command: once a command succeeds, replaying its id returns the first
// result (never the job's current state), the same id with a changed payload conflicts, the same id on another job conflicts,
// and a successful no-op keeps its identity. The command list is generated from the registry: a live-only registry key or a
// guarded command that no case covers fails this file, so a new or missed command cannot pass unnoticed.
const h = createWatchdogHarness("replay-contract", 61000);
const { cases, caseKeys, live, probeJob, norm, CONFLICT } = h;
beforeAll(() => h.boot(), 120000);
afterAll(() => h.stop());

describe("every watchdog_live_only command is covered by this contract", () => {
  it("has a case for every guarded command (the registry's command list)", () => {
    expect(caseKeys.slice().sort()).toEqual(watchdogCommandGuards.map(entry => `${entry.file}#${entry.method}`).sort());
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
    // Same id, another KIND of command: all 17 share one tenant-wide identity, whichever store holds the result.
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
