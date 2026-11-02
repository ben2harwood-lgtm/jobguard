// Orchestration evidence only (synthetic doubles): proves the application layer validates input and
// keeps request identity separate. It is NOT PostgreSQL tenant-isolation proof.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxRelevanceRepository } from "@jobguard/db";
import { InboxRelevanceApplication } from "./inbox-relevance.application.js";
import { PracticeAccess } from "./practice-access.js";

afterEach(() => vi.restoreAllMocks());

const owner = () => ({ context: { tag: randomUUID() }, membershipId: randomUUID(), digest: randomUUID().replace(/-/g, "") });
const methods = ["view", "seed", "setBudget", "dismiss"] as const;
function spyRepo() {
  const spies = Object.fromEntries(methods.map(m => [m, vi.spyOn(InboxRelevanceRepository.prototype, m).mockResolvedValue({} as never)])) as Record<(typeof methods)[number], ReturnType<typeof vi.spyOn>>;
  return { spies, writes: () => methods.reduce((n, m) => n + spies[m].mock.calls.length, 0) };
}
const app = () => new InboxRelevanceApplication({} as Pool, randomUUID());
const seedBody = () => ({ version: "inbox-seed.v1", commandId: randomUUID() });
const budgetBody = (...v: unknown[]) => ({ version: "inbox-budget.v1", commandId: randomUUID(), advisoryBudget: v.length ? v[0] : 5 });
const dismissBody = () => ({ version: "inbox-dismiss.v1", commandId: randomUUID() });

describe("IB1 strict commands reject authority fields", () => {
  const cases = [
    ["seed", "seed", (a: InboxRelevanceApplication, j: string, e: object) => a.seed(j, { ...seedBody(), ...e })],
    ["budget", "setBudget", (a: InboxRelevanceApplication, j: string, e: object) => a.budget(j, { ...budgetBody(), ...e })],
    ["dismiss", "dismiss", (a: InboxRelevanceApplication, j: string, e: object) => a.dismiss(j, randomUUID(), { ...dismissBody(), ...e })],
  ] as const;
  it.each(cases)("%s refuses extra authority fields and still routes valid input", async (_n, method, call) => {
    const { spies, writes } = spyRepo();
    const o = owner();
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue(o as never);
    for (const extra of [{ tenantId: randomUUID() }, { membershipId: randomUUID() }, { digest: "x" }, { context: {} }, { jobId: randomUUID() }]) {
      await expect(call(app(), randomUUID(), extra)).rejects.toThrow();
    }
    expect(writes()).toBe(0);
    await call(app(), randomUUID(), {});
    expect(spies[method]).toHaveBeenCalledTimes(1);
    expect(writes()).toBe(1);
  });
});

describe("IB2 advisory budget bounds", () => {
  it.each([0, 100])("accepts endpoint %s", async v => {
    const { spies } = spyRepo();
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue(owner() as never);
    await app().budget(randomUUID(), budgetBody(v));
    expect(spies.setBudget).toHaveBeenCalledTimes(1);
  });
  it.each([101, 1000, -1, -0.5, 0.5, 50.1, "50", "", null, NaN, Infinity, true, undefined])("refuses %s before persistence", async v => {
    const { writes } = spyRepo();
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue(owner() as never);
    await expect(app().budget(randomUUID(), budgetBody(v))).rejects.toThrow();
    expect(writes()).toBe(0);
  });
});

describe("IB3 interleaved requests keep their own identity", () => {
  it("two applications with distinct jobs and owners never cross context", async () => {
    const { spies } = spyRepo();
    const jobA = randomUUID(), jobB = randomUUID(), oA = owner(), oB = owner();
    const owners = new Map<string, ReturnType<typeof owner>>([[jobA, oA], [jobB, oB]]);
    let arrived = 0, release!: () => void;
    const barrier = new Promise<void>(r => (release = r));
    const lookups: string[] = [];
    vi.spyOn(PracticeAccess.prototype, "job").mockImplementation((async (id: string) => {
      lookups.push(id);
      if (++arrived === 2) release();
      await barrier;
      return owners.get(id);
    }) as never);
    const a = app(), b = app();
    await Promise.all([a.seed(jobA, seedBody()), b.budget(jobB, budgetBody(7))]);
    // reverse completion order, different actions
    arrived = 0;
    const decA = randomUUID(), decB = randomUUID();
    await Promise.all([b.dismiss(jobB, decB, dismissBody()), a.view(jobA)]);
    expect(lookups.sort()).toEqual([jobA, jobA, jobB, jobB].sort());
    expect(spies.seed.mock.calls[0]!.slice(0, 2)).toEqual([oA.context, jobA]);
    expect(spies.seed.mock.calls[0]!.slice(-2)).toEqual([oA.membershipId, oA.digest]);
    expect(spies.setBudget.mock.calls[0]![0]).toBe(oB.context);
    expect(spies.setBudget.mock.calls[0]![1]).toBe(jobB);
    expect(spies.setBudget.mock.calls[0]!.slice(-2)).toEqual([oB.membershipId, oB.digest]);
    expect(spies.dismiss.mock.calls[0]!.slice(0, 3)).toEqual([oB.context, jobB, decB]);
    expect(spies.dismiss.mock.calls[0]!.slice(-2)).toEqual([oB.membershipId, oB.digest]);
    expect(spies.view.mock.calls[0]).toEqual([oA.context, jobA, oA.membershipId, oA.digest]);
  });
});

describe("IB4 invalid input causes no write; authority is checked first", () => {
  it.each([
    ["seed", (a: InboxRelevanceApplication) => a.seed(randomUUID(), { version: "wrong" })],
    ["budget", (a: InboxRelevanceApplication) => a.budget(randomUUID(), budgetBody(101))],
    ["dismiss", (a: InboxRelevanceApplication) => a.dismiss(randomUUID(), randomUUID(), { version: "inbox-dismiss.v1", commandId: "not-a-uuid" })],
  ] as const)("%s: invalid body -> no repository call", async (_n, call) => {
    const { writes } = spyRepo();
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue(owner() as never);
    await expect(call(app())).rejects.toThrow();
    expect(writes()).toBe(0);
  });
  it.each([
    ["seed", (a: InboxRelevanceApplication) => a.seed(randomUUID(), { bad: true })],
    ["budget", (a: InboxRelevanceApplication) => a.budget(randomUUID(), budgetBody(101))],
    ["dismiss", (a: InboxRelevanceApplication) => a.dismiss(randomUUID(), randomUUID(), null)],
  ] as const)("%s: access denial wins over validation error", async (_n, call) => {
    const { writes } = spyRepo();
    const denied = new Error("ACCESS_DENIED");
    vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(denied);
    await expect(call(app())).rejects.toBe(denied);
    expect(writes()).toBe(0);
  });
});
