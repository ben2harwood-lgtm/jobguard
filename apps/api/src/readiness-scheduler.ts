import { createHash } from "node:crypto";
import type { JobHelpers, TaskList } from "graphile-worker";
import { z } from "zod";
import { assertAcyclicDependencies, dueAtLocalTime, evaluateReadiness, MAX_MONEY_PENCE, nextWorkday, proposeResequence, type ResequenceCandidate } from "@jobguard/core";
import { calendarDate, jurisdiction, ReadinessSeamError, readHolidays, readWeather, sameScope, scopeV1, type HolidayReading, type ReadinessAdapters, type ReadinessScope } from "./readiness-adapters.js";

const truth = z.union([z.boolean(), z.literal("unknown")]);
export const scheduledPlanV1 = z.object({
  version: z.literal("readiness-scheduled-plan.v1"), synthetic: z.literal(true), scope: scopeV1,
  factRevision: z.number().int().positive(), ruleRevision: z.literal("readiness-scheduled.v1"),
  status: z.enum(["confirmed", "cancelled"]), plannedDate: calendarDate, jurisdiction,
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u), timeZone: z.string().refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }),
  predecessors: z.array(z.object({ taskId: z.string().uuid(), complete: truth }).strict()),
  edges: z.array(z.object({ taskId: z.string().uuid(), dependsOnTaskId: z.string().uuid() }).strict()),
  material: z.object({ requiredUnits: z.number().int().nonnegative().max(1_000_000), landedUnits: z.number().int().nonnegative().max(1_000_000) }).strict(),
  access: truth, crew: truth,
  labourRatePence: z.number().int().nonnegative().max(MAX_MONEY_PENCE).optional(),
  uncertainDurationHours: z.number().int().nonnegative().max(1_000_000).optional(),
}).strict();
export type ScheduledPlan = z.infer<typeof scheduledPlanV1>;
const taskV1 = z.object({
  version: z.literal("readiness-scheduled-task.v1"), scope: scopeV1,
  planHash: z.string().regex(/^[a-f0-9]{64}$/u), calendarHash: z.string().regex(/^[a-f0-9]{64}$/u),
  dueAt: z.iso.datetime(),
}).strict();
type ScheduledTask = z.infer<typeof taskV1>;
export type ReadinessProposal = Readonly<{
  version: "readiness-prevention-proposal.v1"; scope: ReadinessScope; key: string;
  planHash: string; ruleRevision: string; evaluatedAt: string;
  ready: boolean; reasons: readonly string[]; weather: true | false | "unknown";
  classification: "prevention"; feeEligible: false; recoveryFeePence: 0;
  status: "proposal"; programmeChanged: false;
  labourExposurePence?: number | null | undefined; resequence?: readonly ResequenceCandidate[] | undefined;
}>;
export interface ReadinessSchedulePorts {
  /** Authoritative confirmed plan, scoped by ALL three identifiers. */
  load(scope: ReadinessScope): Promise<unknown>;
  /** Latest confirmed plan per task on the queued tenant/job. Legacy ports offer no candidates. */
  loadJobPlans?(scope: ReadinessScope): Promise<readonly unknown[]>;
  /** Atomically insert-if-absent by key. No commercial or programme write capability. */
  recordProposal(proposal: ReadinessProposal): Promise<void>;
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function parsePlan(raw: unknown): ScheduledPlan {
  const parsed = scheduledPlanV1.safeParse(raw);
  if (!parsed.success) throw new ReadinessSeamError("INVALID_READINESS_PLAN");
  assertAcyclicDependencies(parsed.data.edges);
  return parsed.data;
}
function localDate(now: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function precedingWorkday(plan: ScheduledPlan, calendar: HolidayReading): string | undefined {
  if (plan.plannedDate > calendar.through) return undefined;
  const day = new Date(`${plan.plannedDate}T12:00:00Z`);
  while (true) {
    day.setUTCDate(day.getUTCDate() - 1);
    const date = day.toISOString().slice(0, 10);
    if (date < calendar.from) return undefined;
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && !calendar.holidays.includes(date)) return date;
  }
}
/** Opt-in composition seam: no registration in the live worker, no environment flag can enable live use. */
export class DarkReadinessScheduler {
  constructor(private readonly adapters: ReadinessAdapters, private readonly ports: ReadinessSchedulePorts, private readonly mode = "disabled") {}
  private assertDark(): void {
    if (this.mode !== "synthetic_demo") throw new ReadinessSeamError("READINESS_LIVE_DISABLED");
  }
  private async load(scope: ReadinessScope): Promise<ScheduledPlan> {
    const plan = parsePlan(await this.ports.load(scope));
    if (!sameScope(plan.scope, scope)) throw new ReadinessSeamError("READINESS_SCOPE_MISMATCH");
    return plan;
  }
  async schedule(rawScope: unknown, now: string, queue: Pick<JobHelpers, "addJob">): Promise<string> {
    this.assertDark();
    const scope = scopeV1.safeParse(rawScope);
    if (!scope.success || !z.iso.datetime().safeParse(now).success) throw new ReadinessSeamError("INVALID_READINESS_SCHEDULE");
    const plan = await this.load(scope.data);
    if (plan.status === "cancelled") return "cancelled";
    const calendar = await readHolidays(this.adapters, plan.jurisdiction, now);
    if (calendar.state === "unknown") return "calendar_unknown";
    const today = localDate(now, plan.timeZone), reading = calendar.value;
    // Never infer a working day outside the adapter's explicit coverage.
    if (today < reading.from || today >= reading.through) return "calendar_unknown";
    const next = nextWorkday(today, plan.jurisdiction, {
      "england-and-wales": reading.holidays, scotland: reading.holidays, "northern-ireland": reading.holidays,
    });
    if (next > reading.through) return "calendar_unknown";
    if (plan.plannedDate !== next) return "not_next_workday";
    const previous = precedingWorkday(plan, reading);
    if (previous === undefined) return "calendar_unknown";
    const task: ScheduledTask = { version: "readiness-scheduled-task.v1", scope: plan.scope, planHash: digest(plan), calendarHash: digest(reading), dueAt: dueAtLocalTime(previous, plan.localTime, plan.timeZone) };
    await queue.addJob("readiness_evaluate", task, { runAt: new Date(task.dueAt), jobKey: `readiness:${digest(task)}`, jobKeyMode: "preserve_run_at" });
    return "scheduled";
  }
  register(tasks: TaskList, clock: () => string): void {
    if (Object.hasOwn(tasks, "readiness_evaluate")) throw new ReadinessSeamError("READINESS_TASK_ALREADY_REGISTERED");
    tasks.readiness_evaluate = async raw => { await this.execute(raw, clock()); };
  }
  async execute(raw: unknown, now: string): Promise<string> {
    this.assertDark();
    const parsed = taskV1.safeParse(raw);
    if (!parsed.success || !z.iso.datetime().safeParse(now).success) throw new ReadinessSeamError("INVALID_READINESS_TASK");
    const task = parsed.data, plan = await this.load(task.scope);
    if (plan.status === "cancelled" || digest(plan) !== task.planHash) return "superseded";
    const dueDate = localDate(task.dueAt, plan.timeZone);
    if (dueDate >= plan.plannedDate || task.dueAt !== dueAtLocalTime(dueDate, plan.localTime, plan.timeZone)) throw new ReadinessSeamError("INVALID_READINESS_TASK");
    if (Date.parse(now) < Date.parse(task.dueAt)) throw new ReadinessSeamError("READINESS_NOT_DUE");
    const calendar = await readHolidays(this.adapters, plan.jurisdiction, now);
    if (calendar.state === "known" && digest(calendar.value) !== task.calendarHash) return "calendar_changed";
    if (calendar.state === "known" && dueDate !== precedingWorkday(plan, calendar.value)) throw new ReadinessSeamError("INVALID_READINESS_TASK");
    const weather = await readWeather(this.adapters, { scope: plan.scope, date: plan.plannedDate }, now);
    const predecessors = [...plan.predecessors];
    for (const edge of plan.edges) {
      if (edge.taskId === plan.scope.taskId && !predecessors.some(fact => fact.taskId === edge.dependsOnTaskId)) {
        predecessors.push({ taskId: edge.dependsOnTaskId, complete: "unknown" });
      }
    }
    const result = evaluateReadiness({ version: "readiness-input.v1", taskId: plan.scope.taskId, taskRevision: plan.factRevision, ruleRevision: plan.ruleRevision,
      predecessors, material: plan.material, access: plan.access, crew: plan.crew, evaluatedAt: now,
      weather: weather.state === "known" ? { suitable: weather.value.suitable, observedAt: weather.value.observedAt, staleAfterMinutes: (Date.parse(weather.value.expiresAt) - Date.parse(weather.value.observedAt)) / 60_000, synthetic: true, adapterRevision: weather.value.revision } : null,
      ...(plan.labourRatePence === undefined ? {} : { labourRatePence: plan.labourRatePence }),
      ...(plan.uncertainDurationHours === undefined ? {} : { uncertainDurationHours: plan.uncertainDurationHours }),
    });
    const reasons = [...result.reasons];
    if (weather.state === "unknown" || result.weather === "unknown") reasons.push("Weather availability unknown");
    if (calendar.state === "unknown") reasons.push("Workday calendar unknown");
    const ready = reasons.length === 0;
    const jobPlans = ready || !this.ports.loadJobPlans ? [] : (await this.ports.loadJobPlans(plan.scope))
      .map(raw => scheduledPlanV1.parse(raw))
      .filter(other => other.scope.tenantId === plan.scope.tenantId && other.scope.jobId === plan.scope.jobId)
      .sort((a, b) => a.scope.taskId.localeCompare(b.scope.taskId));
    const risk = ready ? {} : { labourExposurePence: result.exposure?.pence ?? null, resequence: proposeResequence(plan, jobPlans) };
    const key = digest({ task, weather, calendar, reasons, jobPlans, risk });
    await this.ports.recordProposal({ version: "readiness-prevention-proposal.v1", scope: plan.scope, key, planHash: task.planHash, ruleRevision: plan.ruleRevision, evaluatedAt: now,
      ...risk, ready, reasons, weather: result.weather, classification: "prevention", feeEligible: false, recoveryFeePence: 0, status: "proposal", programmeChanged: false });
    return "evaluated";
  }
}
