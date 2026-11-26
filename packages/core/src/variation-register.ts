import { z } from "zod";
import { sha256 } from "./evidence-pack.js";

/**
 * QW-3: the builder's weekly register of extras, one week closing at 18:00 UK time on a Friday and opening at 18:00
 * on the previous Friday. Shows recorded commercial facts only (§5.14): each extra's revision current at the close,
 * its state at the close, and exact integer pence totals (§5.5, summed in BigInt). It never changes money.
 *
 * Each extra is rebuilt "as at the close" from append-only rows (variation, revision, approval, rejection), so later
 * activity does not rewrite a past week. Job titles and which jobs are live are read as they are now. `readHash`
 * identifies exactly what one read returned; it is not a sealed record.
 */
export const REGISTER_CLOSE_HOUR = 18;
export class VariationRegisterError extends Error {
  constructor(readonly code: "INVALID_REGISTER_WEEK" | "REGISTER_WEEK_NOT_CLOSED") { super(code); this.name = "VariationRegisterError"; }
}
const dateV1 = z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
/** A week is named by its closing Friday. */
export const registerWeekV1 = dateV1.refine(value => new Date(`${value}T00:00:00.000Z`).getUTCDay() === 5, "Week must be a Friday");
const iso = z.iso.datetime({ precision: 3 });
const uuid = z.guid();
const pence = z.string().regex(/^-?(?:0|[1-9]\d{0,17})$/u);

const london = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function londonWall(at: number) {
  const parts = london.formatToParts(new Date(at));
  const part = (name: string) => Number(parts.find(value => value.type === name)!.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
}
/** The UTC instant of a UK wall-clock time. 18:00 is never inside a clock change, so it is always unambiguous. */
function londonInstant(date: string, hour: number) {
  const wall = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour);
  let guess = wall;
  for (let step = 0; step < 3; step++) guess = wall - (londonWall(guess) - guess);
  return guess;
}
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);

export type RegisterWeek = { friday: string; opensAt: string; closesAt: string };
export function registerWeekWindowV1(friday: string): RegisterWeek {
  if (!registerWeekV1.safeParse(friday).success) throw new VariationRegisterError("INVALID_REGISTER_WEEK");
  return { friday, opensAt: new Date(londonInstant(addDays(friday, -7), REGISTER_CLOSE_HOUR)).toISOString(),
    closesAt: new Date(londonInstant(friday, REGISTER_CLOSE_HOUR)).toISOString() };
}
/** The most recent week whose Friday 18:00 UK close is at or before `now`. */
export function latestClosedRegisterWeekV1(now: Date): string {
  const today = new Date(londonWall(now.getTime())).toISOString().slice(0, 10);
  let friday = addDays(today, -((new Date(`${today}T00:00:00.000Z`).getUTCDay() + 2) % 7));
  if (Date.parse(registerWeekWindowV1(friday).closesAt) > now.getTime()) friday = addDays(friday, -7);
  return friday;
}

/** One extra as at the week's close, straight from its rows. */
export const registerSourceV1 = z.object({
  jobId: uuid, jobTitle: z.string().min(1), variationId: uuid, createdAt: iso, description: z.string().min(1),
  revision: z.object({ id: uuid, number: z.number().int().positive(), description: z.string().min(1), signedDeltaPence: pence, createdAt: iso }).strict().nullable(),
  approvedAt: iso.nullable(), rejectedAt: iso.nullable(),
}).strict().refine(row => !(row.approvedAt && row.rejectedAt), "An extra cannot be approved and rejected")
  .refine(row => !row.approvedAt || row.revision, "Approval needs a priced revision");
export type RegisterSource = z.infer<typeof registerSourceV1>;

const totalsV1 = z.object({ approvedPence: pence, pendingPence: pence, rejectedPence: pence }).strict();
export const registerExtraV1 = z.object({
  variationId: uuid, revisionId: uuid.nullable(), revision: z.number().int().positive().nullable(), description: z.string(),
  state: z.enum(["approved", "pending", "rejected", "draft"]), signedDeltaPence: pence.nullable(),
  pricedAt: iso.nullable(), decidedAt: iso.nullable(), thisWeek: z.boolean(),
}).strict();
export const variationRegisterV1 = z.object({
  version: z.literal("variation-register.v1"), week: z.object({ friday: z.string(), opensAt: iso, closesAt: iso }).strict(),
  readAt: iso, readHash: z.string().regex(/^[a-f0-9]{64}$/u),
  jobs: z.array(z.object({ jobId: uuid, title: z.string(), extras: z.array(registerExtraV1), totals: totalsV1 }).strict()),
  totals: totalsV1,
}).strict();
export type VariationRegister = z.infer<typeof variationRegisterV1>;
type Totals = z.infer<typeof totalsV1>;

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`
    : JSON.stringify(value);
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function sum(extras: readonly { state: string; signedDeltaPence: string | null }[]): Totals {
  const total = { approved: 0n, pending: 0n, rejected: 0n };
  for (const extra of extras) if (extra.signedDeltaPence !== null && extra.state !== "draft") total[extra.state as keyof typeof total] += BigInt(extra.signedDeltaPence);
  return { approvedPence: String(total.approved), pendingPence: String(total.pending), rejectedPence: String(total.rejected) };
}

export function buildVariationRegisterV1(friday: string, now: Date, rawSources: readonly unknown[]): VariationRegister {
  const week = registerWeekWindowV1(friday);
  if (now.toISOString() < week.closesAt) throw new VariationRegisterError("REGISTER_WEEK_NOT_CLOSED");
  const sources = rawSources.map(row => registerSourceV1.parse(row));
  const inWeek = (at: string | null) => at !== null && at >= week.opensAt && at < week.closesAt;
  const byJob = new Map<string, { title: string; rows: RegisterSource[] }>();
  for (const row of sources) {
    // Only what existed at the close: anything later belongs to a later week.
    if (row.createdAt >= week.closesAt || (row.revision && row.revision.createdAt >= week.closesAt)
      || (row.approvedAt && row.approvedAt >= week.closesAt) || (row.rejectedAt && row.rejectedAt >= week.closesAt)) throw new Error("REGISTER_SOURCE_AFTER_CLOSE");
    const job = byJob.get(row.jobId) ?? { title: row.jobTitle, rows: [] };
    job.rows.push(row); byJob.set(row.jobId, job);
  }
  const jobs = [...byJob.entries()].sort(([a, x], [b, y]) => order(x.title, y.title) || order(a, b)).map(([jobId, job]) => {
    const extras = job.rows.sort((a, b) => order(a.createdAt, b.createdAt) || order(a.variationId, b.variationId)).map(row => {
      const state = row.approvedAt ? "approved" as const : row.rejectedAt ? "rejected" as const : row.revision ? "pending" as const : "draft" as const;
      const decidedAt = row.approvedAt ?? row.rejectedAt;
      return { variationId: row.variationId, revisionId: row.revision?.id ?? null, revision: row.revision?.number ?? null,
        description: row.revision?.description ?? row.description, state, signedDeltaPence: row.revision?.signedDeltaPence ?? null,
        pricedAt: row.revision?.createdAt ?? null, decidedAt, thisWeek: inWeek(row.revision?.createdAt ?? null) || inWeek(decidedAt) };
    });
    return { jobId, title: job.title, extras, totals: sum(extras) };
  });
  const body = { version: "variation-register.v1" as const, week, jobs, totals: sum(jobs.flatMap(job => job.extras)) };
  return variationRegisterV1.parse({ ...body, readAt: now.toISOString(), readHash: sha256(canonical(body)) });
}

/** Exact pence as pounds text, e.g. "-GBP 1,234.05". BigInt only, never a float. */
export function formatRegisterPence(value: string): string {
  const amount = BigInt(pence.parse(value)), negative = amount < 0n, abs = negative ? -amount : amount;
  const pounds = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ","), rest = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}GBP ${pounds}.${rest}`;
}

const WIDTH = 88, BODY_LINES = 40, AMOUNT = 18;
const ascii = (value: string) => value.normalize("NFKD").replace(/[^\x20-\x7e]/gu, "?");
const escapePdf = (value: string) => value.replace(/[\\()]/gu, c => `\\${c}`);
function wrap(text: string, width: number) {
  const out: string[] = []; let line = "";
  for (const word of ascii(text).split(/\s+/u).filter(Boolean)) {
    for (let chunk = word; chunk.length; chunk = chunk.slice(width)) {
      const piece = chunk.slice(0, width);
      if (!line) line = piece; else if (`${line} ${piece}`.length <= width) line += ` ${piece}`; else { out.push(line); line = piece; }
    }
  }
  return out.length || line ? [...out, ...(line ? [line] : [])] : [""];
}
const row = (left: string, amount = "") => { const text = ascii(left).slice(0, WIDTH - AMOUNT - 1); return `${text.padEnd(WIDTH - AMOUNT)}${amount.padStart(AMOUNT)}`; };
const stateLabel = { approved: "Approved", pending: "Waiting for customer", rejected: "Rejected", draft: "Not priced yet" } as const;
function totalsRows(totals: Totals, indent = "") {
  return [row(`${indent}Approved`, formatRegisterPence(totals.approvedPence)), row(`${indent}Waiting for customer`, formatRegisterPence(totals.pendingPence)),
    row(`${indent}Rejected`, formatRegisterPence(totals.rejectedPence))];
}

/** Body blocks: a cover with every job's totals and the grand totals, then one block per job, each starting a new page. */
export function variationRegisterPdfBlocks(register: VariationRegister): string[][] {
  const r = variationRegisterV1.parse(register);
  const cover = ["COVER: ALL JOBS", ""];
  if (!r.jobs.length) cover.push("No extras recorded on live jobs by the close of this week.", "");
  for (const job of r.jobs) cover.push(...wrap(job.title, WIDTH), ...totalsRows(job.totals, "  "), "");
  cover.push("ALL JOBS", ...totalsRows(r.totals, "  "), "", "* = priced, approved or rejected this week.");
  const jobs = r.jobs.map(job => {
    const lines = [...wrap(`JOB: ${job.title}`, WIDTH), `Job ${job.jobId}`, ""];
    for (const extra of job.extras) {
      // Wrap 2 narrower than the amount column so the indented continuation lines are never cut.
      const text = wrap(`${extra.thisWeek ? "* " : "  "}${extra.description}`, WIDTH - AMOUNT - 3);
      lines.push(row(text[0]!, extra.signedDeltaPence === null ? "-" : formatRegisterPence(extra.signedDeltaPence)), ...text.slice(1).map(line => row(`  ${line}`)));
      const when = extra.decidedAt ? ` ${extra.decidedAt.slice(0, 10)}` : extra.pricedAt ? `, priced ${extra.pricedAt.slice(0, 10)}` : "";
      lines.push(row(`    ${stateLabel[extra.state]}${when}${extra.revision ? ` | revision ${extra.revision}` : ""}`));
    }
    lines.push("", "JOB TOTALS", ...totalsRows(job.totals, "  "));
    return lines;
  });
  return [cover, ...jobs];
}

/** Pure, dependency-free PDF (Courier so amounts line up). Every page carries the practice banner, week, read time and hash. */
export function renderVariationRegisterPdf(register: VariationRegister): Uint8Array {
  const r = variationRegisterV1.parse(register);
  const bodies = variationRegisterPdfBlocks(r).flatMap(block => Array.from({ length: Math.max(1, Math.ceil(block.length / BODY_LINES)) }, (_, i) => block.slice(i * BODY_LINES, (i + 1) * BODY_LINES)));
  const pages = bodies.map((body, i) => [
    "PRACTICE SANDBOX - SYNTHETIC DATA - NOTHING IS SENT OR CHARGED",
    `EXTRAS REGISTER | Week ${r.week.friday}: ${r.week.opensAt} to ${r.week.closesAt}`,
    `Generated ${r.readAt} | Page ${i + 1} of ${bodies.length}`,
    `Read hash ${r.readHash}`, "", ...body].map(line => escapePdf(ascii(line))));
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 3 + i * 2), fontId = 3 + pages.length * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(x => `${x} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((lines, i) => {
    const pageId = pageIds[i]!, commands = ["BT /F1 9 Tf 48 790 Td 13 TL", ...lines.map((line, index) => `${index ? "T* " : ""}(${line}) Tj`), "ET"].join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`;
  });
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  for (let i = 1; i < objects.length; i++) { offsets[i] = pdf.length; pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(x => `${String(x).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
