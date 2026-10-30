import { z } from "zod";

export class ReadinessSeamError extends Error {
  constructor(readonly code: "READINESS_LIVE_DISABLED" | "INVALID_READINESS_PLAN" | "READINESS_SCOPE_MISMATCH" | "INVALID_READINESS_SCHEDULE" | "READINESS_TASK_ALREADY_REGISTERED" | "INVALID_READINESS_TASK" | "READINESS_NOT_DUE" | "READINESS_STORE_CONFLICT" | "INVALID_READINESS_PROPOSAL") { super(code); this.name = "ReadinessSeamError"; }
}
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(
  value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
);
export const jurisdiction = z.enum(["england-and-wales", "scotland", "northern-ireland"]);
export const scopeV1 = z.object({ tenantId: z.string().uuid(), jobId: z.string().uuid(), taskId: z.string().uuid() }).strict();
const revision = z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/u);
const stamp = z.iso.datetime();
const provenance = { synthetic: z.literal(true), revision, observedAt: stamp, expiresAt: stamp };
export const weatherReadingV1 = z.object({
  version: z.literal("readiness-weather.v1"), ...provenance, scope: scopeV1,
  date: calendarDate, suitable: z.union([z.boolean(), z.literal("unknown")]),
}).strict();
export const holidayReadingV1 = z.object({
  version: z.literal("readiness-holidays.v1"), ...provenance, jurisdiction,
  from: calendarDate, through: calendarDate, holidays: z.array(calendarDate),
}).strict().refine(value => value.from <= value.through && value.holidays.every(day => day >= value.from && day <= value.through));
export type ReadinessScope = z.infer<typeof scopeV1>;
export type WeatherReading = z.infer<typeof weatherReadingV1>;
export type HolidayReading = z.infer<typeof holidayReadingV1>;
export type WeatherRequest = Readonly<{ scope: ReadinessScope; date: string }>;
export interface ReadinessAdapters {
  weather(request: WeatherRequest): Promise<unknown>;
  holidays(region: z.infer<typeof jurisdiction>): Promise<unknown>;
}
export type AdapterFact<T> = { state: "known"; value: T } | { state: "unknown"; reason: "outage" | "invalid" | "stale" };
export function sameScope(a: ReadinessScope, b: ReadinessScope): boolean {
  return a.tenantId === b.tenantId && a.jobId === b.jobId && a.taskId === b.taskId;
}
function fresh(value: { observedAt: string; expiresAt: string }, now: string): boolean {
  return Date.parse(value.observedAt) <= Date.parse(now) && Date.parse(now) < Date.parse(value.expiresAt);
}
export async function readWeather(adapters: ReadinessAdapters, request: WeatherRequest, now: string): Promise<AdapterFact<WeatherReading>> {
  let raw: unknown;
  try { raw = await adapters.weather(request); } catch { return { state: "unknown", reason: "outage" }; }
  const parsed = weatherReadingV1.safeParse(raw);
  if (!parsed.success || !sameScope(parsed.data.scope, request.scope) || parsed.data.date !== request.date) return { state: "unknown", reason: "invalid" };
  return fresh(parsed.data, now) ? { state: "known", value: parsed.data } : { state: "unknown", reason: "stale" };
}
export async function readHolidays(adapters: ReadinessAdapters, region: z.infer<typeof jurisdiction>, now: string): Promise<AdapterFact<HolidayReading>> {
  let raw: unknown;
  try { raw = await adapters.holidays(region); } catch { return { state: "unknown", reason: "outage" }; }
  const parsed = holidayReadingV1.safeParse(raw);
  if (!parsed.success || parsed.data.jurisdiction !== region) return { state: "unknown", reason: "invalid" };
  return fresh(parsed.data, now) ? { state: "known", value: parsed.data } : { state: "unknown", reason: "stale" };
}
/** Fixtures are supplied by tests, never fetched. This adapter owns no endpoint or credential. */
export class FixtureReadinessAdapters implements ReadinessAdapters {
  constructor(private readonly readings: { weather: readonly WeatherReading[]; holidays: readonly HolidayReading[] }) {}
  async weather(request: WeatherRequest): Promise<unknown> {
    return structuredClone(this.readings.weather.find(value => sameScope(value.scope, request.scope) && value.date === request.date) ?? null);
  }
  async holidays(region: z.infer<typeof jurisdiction>): Promise<unknown> {
    return structuredClone(this.readings.holidays.find(value => value.jurisdiction === region) ?? null);
  }
}
/** D04/G2 are not approvals. All live use is unconditionally refused in this slice. */
export const refusedLiveReadinessAdapters: ReadinessAdapters = {
  async weather() { throw new ReadinessSeamError("READINESS_LIVE_DISABLED"); },
  async holidays() { throw new ReadinessSeamError("READINESS_LIVE_DISABLED"); },
};
