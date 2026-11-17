import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "./migrate.js";
const name = "0505_onsite_diary_admission.sql";
const sql = readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
// Source/protocol checks only; PostgreSQL CI executes the adversarial suite.
describe("SV-7A on-site migration boundaries", () => {
 it("is discovered and sent atomically by the actual migration runner", async () => {
  expect(MIGRATION_URLS.filter(url => url.pathname.endsWith(`/${name}`))).toHaveLength(1);
  const queries: string[] = [];
  await migrate({ query: async (query: string, values?: unknown[]) => {
   queries.push(query); return { rows: [], rowCount: values?.[0] === name ? 0 : 1 };
  } } as Parameters<typeof migrate>[0]);
  expect(queries.filter(query => query.startsWith(sql.slice(0, 80)))).toHaveLength(1);
  expect(queries.find(query => query.startsWith(sql.slice(0, 80)))).toContain(`VALUES('${name}') ON CONFLICT DO NOTHING;\nCOMMIT;`);
 });
 it("keeps admission after replay and lifecycle checks, before effects and audit", () => {
  const intake = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION app.sv7a_intake_job_source"));
  const ordered = ["RETURN prior.result", "POST_LOCK_WORK_REQUIRES_LINKED_JOB", "app.require_watchdog_live(j)", "hashtextextended(t::text,184)", "app.ch4_admit_place(t,j,'restart')", "INSERT INTO app.command_receipt", "INSERT INTO app.evidence_upload", "INSERT INTO app.job_diary_entry", "app.append_final_check_audit"];
  const positions = ordered.map(part => intake.indexOf(part));
  expect(positions.every(position => position >= 0)).toBe(true); expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(intake).not.toContain("RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'");
 });
 it("retains MON-1 capacity-before-event locks, source exclusions, and private ACLs", () => {
  const capture = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION app.ch4_capture_site_source"), sql.indexOf("CREATE TRIGGER ch4_diary_received"));
  expect(capture.indexOf("hashtextextended(r.tenant_id::text,184)")).toBeLessThan(capture.indexOf("r.job_id::text,144)"));
  expect(capture).toContain("IF NOT NEW.on_site THEN RETURN NEW");
  expect(capture).toContain("IN('photo','delivery_note','goods_receipt','diary') THEN 'first_site_evidence'");
  expect(capture).toContain("NEW.job_track<>'small_builder'");
  expect(sql).not.toMatch(/\b(?:GRANT|REVOKE)\b/u);
  expect(sql).not.toMatch(/app\.(?:shadow|recovery|finding|eligibility)/u);
 });
});
