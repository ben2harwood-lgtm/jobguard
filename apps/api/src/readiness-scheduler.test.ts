import { describe, expect, it, vi } from "vitest";
import type { JobHelpers, TaskList } from "graphile-worker";
import { DarkReadinessScheduler, type ReadinessProposal, type ScheduledPlan } from "./readiness-scheduler.js";
import { FixtureReadinessAdapters, readHolidays, readWeather, refusedLiveReadinessAdapters, type HolidayReading, type ReadinessAdapters, type WeatherReading } from "./readiness-adapters.js";

const scope = { tenantId: "10000000-0000-4000-8000-000000000001", jobId: "10000000-0000-4000-8000-000000000002", taskId: "10000000-0000-4000-8000-000000000003" };
const other = "10000000-0000-4000-8000-000000000004";
const now = "2026-08-28T12:00:00.000Z", due = "2026-09-01T08:00:00.000Z";
const provenance = { synthetic: true as const, revision: "fixture.v1", observedAt: "2026-08-28T00:00:00.000Z", expiresAt: "2026-09-02T00:00:00.000Z" };
const holidays: HolidayReading[] = ["england-and-wales", "scotland", "northern-ireland"].map(region => ({
  version: "readiness-holidays.v1", ...provenance, jurisdiction: region as HolidayReading["jurisdiction"],
  from: "2026-01-01", through: "2026-12-31", holidays: region === "scotland" ? ["2026-01-02"] : region === "northern-ireland" ? ["2026-07-13", "2026-08-31"] : ["2026-08-31"],
}));
const weather: WeatherReading = { version: "readiness-weather.v1", ...provenance, scope, date: "2026-09-01", suitable: true };
const plan: ScheduledPlan = { version: "readiness-scheduled-plan.v1", synthetic: true, scope, factRevision: 1, ruleRevision: "readiness-scheduled.v1", status: "confirmed",
  plannedDate: "2026-09-01", jurisdiction: "england-and-wales", timeZone: "Europe/London", localTime: "09:00", predecessors: [], edges: [], material: { requiredUnits: 10, landedUnits: 10 }, access: true, crew: true };
function harness(overrides: Partial<ScheduledPlan> = {}, adapters?: ReadinessAdapters, mode = "synthetic_demo") {
  let current: unknown = { ...plan, ...overrides };
  const records = new Map<string, ReadinessProposal>();
  const load = vi.fn(async () => structuredClone(current));
  const recordProposal = vi.fn(async (proposal: ReadinessProposal) => { if (!records.has(proposal.key)) records.set(proposal.key, structuredClone(proposal)); });
  const scheduler = new DarkReadinessScheduler(adapters ?? new FixtureReadinessAdapters({ weather: [weather], holidays }), { load, recordProposal }, mode);
  const addJob = vi.fn(async (..._args: unknown[]) => ({}));
  const queue = { addJob } as unknown as Pick<JobHelpers, "addJob">;
  const task = () => addJob.mock.calls.at(-1)![1];
  return { scheduler, load, recordProposal, records, addJob, queue, task, change: (value: unknown) => { current = value; } };
}

describe("M2-6 dark factual adapter seams", () => {
  it("returns jurisdiction-specific fixtures without treating absent data as false", async () => {
    const fake = new FixtureReadinessAdapters({ weather: [weather], holidays });
    for (const region of ["england-and-wales", "scotland", "northern-ireland"] as const) {
      const fact = await readHolidays(fake, region, now);
      expect(fact.state).toBe("known");
      if (fact.state === "known") expect(fact.value.holidays).toEqual(holidays.find(value => value.jurisdiction === region)!.holidays);
    }
    expect(await readWeather(fake, { scope, date: "2026-09-01" }, now)).toEqual({ state: "known", value: weather });
    expect(await readWeather(fake, { scope, date: "2026-08-31" }, now)).toEqual({ state: "unknown", reason: "invalid" });
  });
  it("keeps false distinct from unknown, stale, future and outage readings", async () => {
    for (const suitable of [false, "unknown"] as const) {
      const fake = new FixtureReadinessAdapters({ weather: [{ ...weather, suitable }], holidays });
      expect(await readWeather(fake, { scope, date: weather.date }, now)).toEqual({ state: "known", value: { ...weather, suitable } });
    }
    for (const at of [provenance.expiresAt, "2026-08-27T00:00:00.000Z"]) {
      expect(await readWeather(new FixtureReadinessAdapters({ weather: [weather], holidays }), { scope, date: weather.date }, at)).toEqual({ state: "unknown", reason: "stale" });
    }
    const failed = { weather: async () => { throw new Error("secret customer data"); }, holidays: async () => { throw new Error("secret key"); } };
    expect(await readWeather(failed, { scope, date: weather.date }, now)).toEqual({ state: "unknown", reason: "outage" });
    expect(await readHolidays(failed, "scotland", now)).toEqual({ state: "unknown", reason: "outage" });
  });
  it("rejects other-tenant/wrong-job readings and authority-bearing or real data", async () => {
    for (const patch of [{ scope: { ...scope, tenantId: other } }, { scope: { ...scope, jobId: other } }, { scope: { ...scope, taskId: other } }, { synthetic: false }, { approved: true }, { secret: "secret key" }]) {
      const adapters = { weather: async () => ({ ...weather, ...patch }), holidays: async () => holidays[0] };
      expect(await readWeather(adapters, { scope, date: weather.date }, now)).toEqual({ state: "unknown", reason: "invalid" });
    }
    expect(await readHolidays({ weather: async () => null, holidays: async () => holidays[0] }, "scotland", now)).toEqual({ state: "unknown", reason: "invalid" });
    await expect(refusedLiveReadinessAdapters.weather({ scope, date: weather.date })).rejects.toThrow("READINESS_LIVE_DISABLED");
    await expect(refusedLiveReadinessAdapters.holidays("scotland")).rejects.toThrow("READINESS_LIVE_DISABLED");
  });
});

describe("M2-6 Graphile scheduled prevention", () => {
  it("enqueues next-workday at local time, dedupes scheduling and registers the actual handler", async () => {
    const h = harness({ access: "unknown" });
    expect(await h.scheduler.schedule(scope, now, h.queue)).toBe("scheduled");
    await h.scheduler.schedule(scope, now, h.queue);
    expect(h.addJob.mock.calls[0]).toEqual(h.addJob.mock.calls[1]);
    expect(h.addJob.mock.calls[0]![0]).toBe("readiness_evaluate");
    expect(h.addJob.mock.calls[0]![2]).toMatchObject({ runAt: new Date(due), jobKeyMode: "preserve_run_at" });
    const tasks: TaskList = {}; h.scheduler.register(tasks, () => due);
    await Promise.all([tasks.readiness_evaluate!(h.task(), {} as JobHelpers), tasks.readiness_evaluate!(h.task(), {} as JobHelpers)]);
    expect(h.records.size).toBe(1);
    expect([...h.records.values()][0]).toMatchObject({ ready: false, reasons: ["Access availability unknown"], status: "proposal", programmeChanged: false, classification: "prevention", feeEligible: false, recoveryFeePence: 0 });
    expect(() => h.scheduler.register(tasks, () => due)).toThrow("READINESS_TASK_ALREADY_REGISTERED");
  });
  it("does not raise a risk for fully ready work; missing explicit facts and partial completion raise risks", async () => {
    for (const patch of [{}, { predecessors: [{ taskId: other, complete: false as const }] }, { material: { requiredUnits: 10, landedUnits: 9 } }, { access: false as const }, { crew: "unknown" as const }]) {
      const h = harness(patch); await h.scheduler.schedule(scope, now, h.queue); await h.scheduler.execute(h.task(), due);
      expect([...h.records.values()][0]!.ready).toBe(Object.keys(patch).length === 0);
    }
  });
  it("covers calendar differences, weekends, local midnight and both DST changes", async () => {
    const cases = [
      { at: now, region: "scotland", day: "2026-08-31", runAt: "2026-08-31T08:00:00.000Z" },
      { at: now, region: "northern-ireland", day: "2026-09-01", runAt: due },
      { at: "2026-07-10T12:00:00.000Z", region: "northern-ireland", day: "2026-07-14", runAt: "2026-07-14T08:00:00.000Z" },
      { at: "2026-07-10T12:00:00.000Z", region: "england-and-wales", day: "2026-07-13", runAt: "2026-07-13T08:00:00.000Z" },
      { at: "2026-01-01T12:00:00.000Z", region: "scotland", day: "2026-01-05", runAt: "2026-01-05T09:00:00.000Z" },
      { at: "2026-01-01T12:00:00.000Z", region: "england-and-wales", day: "2026-01-02", runAt: "2026-01-02T09:00:00.000Z" },
      { at: "2026-03-27T12:00:00.000Z", region: "england-and-wales", day: "2026-03-30", runAt: "2026-03-30T08:00:00.000Z" },
      { at: "2026-10-23T12:00:00.000Z", region: "scotland", day: "2026-10-26", runAt: "2026-10-26T09:00:00.000Z" },
      { at: "2026-08-30T23:30:00.000Z", region: "england-and-wales", day: "2026-09-01", runAt: due },
    ];
    for (const c of cases) {
      const calendars = holidays.map(value => ({ ...value, observedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z" }));
      const h = harness({ jurisdiction: c.region as ScheduledPlan["jurisdiction"], plannedDate: c.day }, new FixtureReadinessAdapters({ weather: [], holidays: calendars }));
      expect(await h.scheduler.schedule(scope, c.at, h.queue)).toBe("scheduled");
      expect(h.addJob.mock.calls[0]![2]).toMatchObject({ runAt: new Date(c.runAt) });
    }
  });
  it("does not invent a next workday during outage, stale or incomplete calendar coverage", async () => {
    for (const data of [null, { ...holidays[0], expiresAt: now }, { ...holidays[0], through: "2026-08-31" }, { ...holidays[0], from: "2026-09-01" }]) {
      const h = harness({}, { weather: async () => weather, holidays: async () => data });
      expect(await h.scheduler.schedule(scope, now, h.queue)).toBe("calendar_unknown"); expect(h.addJob).not.toHaveBeenCalled();
    }
    const h = harness({ plannedDate: "2026-08-31" });
    expect(await h.scheduler.schedule(scope, now, h.queue)).toBe("not_next_workday");
  });
  it("evaluates provider outage and stale weather as unknown risk without leaking provider errors", async () => {
    let failed = false;
    const adapters = { weather: async () => { if (failed) throw new Error("secret key personal data"); return { ...weather, expiresAt: due }; }, holidays: async () => { if (failed) throw new Error("secret"); return holidays[0]; } };
    const h = harness({}, adapters); await h.scheduler.schedule(scope, now, h.queue);
    await h.scheduler.execute(h.task(), due);
    expect([...h.records.values()][0]).toMatchObject({ ready: false, weather: "unknown", reasons: ["Weather availability unknown"] });
    failed = true; await h.scheduler.execute(h.task(), due);
    expect([...h.records.values()][1]).toMatchObject({ ready: false, reasons: ["Weather availability unknown", "Workday calendar unknown"] });
    expect(JSON.stringify([...h.records.values()])).not.toMatch(/secret|personal data/u);
  });
  it("supersedes changed dates/facts and handles cancellation before scheduling or after enqueue", async () => {
    for (const patch of [{ plannedDate: "2026-09-02" }, { factRevision: 2 }, { status: "cancelled" }]) {
      const h = harness(); await h.scheduler.schedule(scope, now, h.queue);
      h.change({ ...plan, ...patch });
      expect(await h.scheduler.execute(h.task(), due)).toBe("superseded"); expect(h.recordProposal).not.toHaveBeenCalled();
    }
    const h = harness({ status: "cancelled" });
    expect(await h.scheduler.schedule(scope, now, h.queue)).toBe("cancelled"); expect(h.addJob).not.toHaveBeenCalled();
  });
  it("new fact versions change the dedupe key and calendar changes require rescheduling", async () => {
    let calendar = holidays[0];
    const h = harness({}, { weather: async () => weather, holidays: async () => calendar });
    await h.scheduler.schedule(scope, now, h.queue); const old = h.task(); await h.scheduler.execute(old, due);
    h.change({ ...plan, factRevision: 2 }); await h.scheduler.schedule(scope, now, h.queue); await h.scheduler.execute(h.task(), due);
    expect(h.records.size).toBe(2);
    expect(await h.scheduler.execute(old, due)).toBe("superseded");
    calendar = { ...holidays[0]!, revision: "fixture.v2" };
    expect(await h.scheduler.execute(h.task(), due)).toBe("calendar_changed"); expect(h.records.size).toBe(2);
  });
  it("binds weather versions and changed payloads rather than reusing a replay key", async () => {
    let reading = weather;
    const h = harness({}, { weather: async () => reading, holidays: async () => holidays[0] });
    await h.scheduler.schedule(scope, now, h.queue);
    await h.scheduler.execute(h.task(), due);
    reading = { ...weather, revision: "fixture.v2", suitable: false };
    await h.scheduler.execute(h.task(), due); await h.scheduler.execute(h.task(), due);
    expect(h.records.size).toBe(2);
    expect([...h.records.values()].map(value => value.ready)).toEqual([true, false]);
    // Reusing a task's content hash after its authoritative input changes cannot execute it.
    h.change({ ...plan, access: false });
    expect(await h.scheduler.execute(h.task(), due)).toBe("superseded");
    expect(h.records.size).toBe(2);
  });
  it("refuses default/live execution, wrong scope, arbitrary authority, model suggestions and early/forged tasks", async () => {
    for (const mode of ["disabled", "pilot_no_charge", "production_billing", "provider_sandbox"]) {
      const h = harness({}, undefined, mode);
      await expect(h.scheduler.schedule(scope, now, h.queue)).rejects.toThrow("READINESS_LIVE_DISABLED");
      await expect(h.scheduler.execute({}, due)).rejects.toThrow("READINESS_LIVE_DISABLED"); expect(h.load).not.toHaveBeenCalled();
    }
    const disabled = new DarkReadinessScheduler(refusedLiveReadinessAdapters, { load: async () => { throw new Error("must not load"); }, recordProposal: async () => undefined });
    await expect(disabled.schedule(scope, now, harness().queue)).rejects.toThrow("READINESS_LIVE_DISABLED");
    const h = harness(); await h.scheduler.schedule(scope, now, h.queue);
    await expect(h.scheduler.execute(h.task(), now)).rejects.toThrow("READINESS_NOT_DUE");
    for (const patch of [{ dueAt: now }, { approved: true }, { modelSuggestion: { cureHours: 1 } }, { lockedBillId: other }, { amountPence: 1 }, { finalAccountRevision: 2 }, { commandId: other }, { idempotencyKey: "reuse" }]) {
      await expect(h.scheduler.execute({ ...(h.task() as object), ...patch }, due)).rejects.toThrow("INVALID_READINESS_TASK");
    }
    for (const patch of [{ tenantId: other }, { jobId: other }, { taskId: other }]) {
      await expect(h.scheduler.execute({ ...(h.task() as object), scope: { ...scope, ...patch } }, due)).rejects.toThrow("READINESS_SCOPE_MISMATCH");
    }
    expect(h.recordProposal).not.toHaveBeenCalled();
  });
  it("rejects cycles, unconfirmed/model plans, invalid quantities, exposure overflow and unknown versions", async () => {
    for (const patch of [{ status: "model_suggested" }, { synthetic: false }, { ruleRevision: "unknown" }, { cureHours: 1 }, { material: { requiredUnits: -1, landedUnits: 0 } }, { labourRatePence: -1 }, { labourRatePence: 1_000_000_000_001 }, { labourRatePence: 0.5 }]) {
      const h = harness(); h.change({ ...plan, ...patch }); await expect(h.scheduler.schedule(scope, now, h.queue)).rejects.toThrow("INVALID_READINESS_PLAN");
    }
    const cycle = harness({ edges: [{ taskId: scope.taskId, dependsOnTaskId: other }, { taskId: other, dependsOnTaskId: scope.taskId }] });
    await expect(cycle.scheduler.schedule(scope, now, cycle.queue)).rejects.toThrow("DEPENDENCY_CYCLE");
    const overflow = harness({ labourRatePence: 1_000_000_000_000, uncertainDurationHours: 2 });
    await overflow.scheduler.schedule(scope, now, overflow.queue); await expect(overflow.scheduler.execute(overflow.task(), due)).rejects.toThrow("Money result exceeds"); expect(overflow.records.size).toBe(0);
    for (const labourRatePence of [0, 1, 999_999_999_999]) {
      const h = harness({ access: false, labourRatePence, uncertainDurationHours: 1 }); await h.scheduler.schedule(scope, now, h.queue); await h.scheduler.execute(h.task(), due);
      expect([...h.records.values()][0]).toMatchObject({ recoveryFeePence: 0, feeEligible: false });
    }
  });
});
