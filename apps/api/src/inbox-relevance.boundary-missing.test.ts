// Orchestration evidence only (synthetic doubles): proves the application layer validates input and
// keeps request identity separate. It is NOT PostgreSQL tenant-isolation proof.
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { ZodError } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxRelevanceRepository } from "@jobguard/db";
import { InboxRelevanceApplication } from "./inbox-relevance.application.js";
import { PracticeAccess } from "./practice-access.js";

afterEach(() => vi.restoreAllMocks());

// Additive coverage: keep the original IB1–IB4 assertions below unchanged.
function requestFixture() {
  const sessionId = randomUUID();
  return {
    sessionId,
    jobId: randomUUID(),
    decisionId: randomUUID(),
    principal: {
      context: { tenantId: randomUUID() },
      membershipId: randomUUID(),
      identityUserId: randomUUID(),
      digest: createHash("sha256").update(sessionId).digest("hex"),
    },
  };
}

function repositoryDoubles() {
  return {
    view: vi.spyOn(InboxRelevanceRepository.prototype, "view").mockResolvedValue({} as never),
    seed: vi.spyOn(InboxRelevanceRepository.prototype, "seed").mockResolvedValue({} as never),
    setBudget: vi.spyOn(InboxRelevanceRepository.prototype, "setBudget").mockResolvedValue({} as never),
    dismiss: vi.spyOn(InboxRelevanceRepository.prototype, "dismiss").mockResolvedValue({} as never),
  };
}

const actions = ["view", "seed", "budget", "dismiss"] as const;
type Action = (typeof actions)[number];
type RequestFixture = ReturnType<typeof requestFixture>;

function invoke(action: Action, application: InboxRelevanceApplication, request: RequestFixture, raw: unknown) {
  if (action === "view") return application.view(request.jobId);
  if (action === "dismiss") return application.dismiss(request.jobId, request.decisionId, raw);
  return application[action](request.jobId, raw);
}

function commandFor(action: Action, advisoryBudget = 0) {
  return {
    version: `inbox-${action}.v1`,
    commandId: randomUUID(),
    ...(action === "budget" ? { advisoryBudget } : {}),
  };
}

function expectedArguments(action: Action, request: RequestFixture, command: ReturnType<typeof commandFor>) {
  const { context, membershipId, digest } = request.principal;
  const subject = [context, request.jobId];
  const authority = [membershipId, digest];
  if (action === "view") return [...subject, ...authority];
  if (action === "seed") return [...subject, command.commandId, ...authority];
  if (action === "budget") return [...subject, command, ...authority];
  return [...subject, request.decisionId, command, ...authority];
}

describe("IB1/IB4 exact command routing and typed validation (orchestration only)", () => {
  it.each(["seed", "budget", "dismiss"] as const)("%s rejects malformed envelopes without calling any repository operation", async action => {
    const repository = repositoryDoubles();
    const request = requestFixture();
    const access = vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue(request.principal as never);
    const application = new InboxRelevanceApplication({} as Pool, request.sessionId);
    const command = commandFor(action);
    const invalid = [
      { ...command, tenantId: randomUUID() },
      { ...command, membershipId: randomUUID() },
      { ...command, jobId: randomUUID() },
      { ...command, digest: "forged" },
      { ...command, context: request.principal.context },
      { ...command, lane: "advisory" },
      { ...command, approved: true },
      { ...command, amountPence: 1 },
      { ...command, version: `${command.version}.future` },
      { ...command, commandId: "invalid-command" },
      { ...command, commandId: undefined },
      null,
    ];
    for (const raw of invalid) {
      await expect(invoke(action, application, request, raw)).rejects.toBeInstanceOf(ZodError);
      for (const spy of Object.values(repository)) expect(spy).not.toHaveBeenCalled();
    }
    expect(access.mock.calls).toEqual(invalid.map(() => [request.jobId]));
    await invoke(action, application, request, command);
    const method = action === "budget" ? "setBudget" : action;
    expect(repository[method].mock.calls).toEqual([expectedArguments(action, request, command)]);
    for (const [name, spy] of Object.entries(repository)) {
      if (name !== method) expect(spy).not.toHaveBeenCalled();
    }
  });

  it.each([0, 100])("IB2 forwards budget endpoint %s unchanged with verified authority", async advisoryBudget => {
    const repository = repositoryDoubles();
    const request = requestFixture();
    const access = vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue(request.principal as never);
    const application = new InboxRelevanceApplication({} as Pool, request.sessionId);
    const command = commandFor("budget", advisoryBudget);
    await application.budget(request.jobId, command);
    expect(access.mock.calls).toEqual([[request.jobId]]);
    expect(repository.setBudget.mock.calls).toEqual([expectedArguments("budget", request, command)]);
    expect(repository.view).not.toHaveBeenCalled();
    expect(repository.seed).not.toHaveBeenCalled();
    expect(repository.dismiss).not.toHaveBeenCalled();
  });
});

describe("IB3 controlled overlapping sessions (no PostgreSQL isolation claim)", () => {
  it.each(actions)("%s waits for each ownership lookup and completes B before A without mixing identity", async action => {
    const repository = repositoryDoubles();
    const a = requestFixture(), b = requestFixture();
    const pool = {} as Pool;
    const appA = new InboxRelevanceApplication(pool, a.sessionId);
    const appB = new InboxRelevanceApplication(pool, b.sessionId);
    const commandA = commandFor(action, 0), commandB = commandFor(action, 100);
    let releaseA!: () => void, releaseB!: () => void;
    const heldA = new Promise<void>(resolve => { releaseA = resolve; });
    const heldB = new Promise<void>(resolve => { releaseB = resolve; });
    const access = vi.spyOn(PracticeAccess.prototype, "job").mockImplementation(async function (this: PracticeAccess, jobId) {
      expect([a.jobId, b.jobId]).toContain(jobId);
      const request = jobId === a.jobId ? a : b;
      // Assert the real bridge instance received this request's session, without authenticating it.
      expect(this).toHaveProperty("sessionId", request.sessionId);
      await (request === a ? heldA : heldB);
      return request.principal as never;
    });
    const pendingA = invoke(action, appA, a, commandA);
    const pendingB = invoke(action, appB, b, commandB);
    const settled = Promise.allSettled([pendingA, pendingB]);
    try {
      expect(access.mock.calls).toEqual([[a.jobId], [b.jobId]]);
      await Promise.resolve();
      for (const spy of Object.values(repository)) expect(spy).not.toHaveBeenCalled();

      releaseB();
      await pendingB;
      const method = action === "budget" ? "setBudget" : action;
      expect(repository[method].mock.calls).toEqual([expectedArguments(action, b, commandB)]);

      releaseA();
      await pendingA;
      expect(repository[method].mock.calls).toEqual([
        expectedArguments(action, b, commandB),
        expectedArguments(action, a, commandA),
      ]);
      for (const [name, spy] of Object.entries(repository)) {
        if (name !== method) expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      releaseA();
      releaseB();
      await settled;
    }
  });
});

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
