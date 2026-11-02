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

describe("SV-7A practice diary admission repair", () => {
 const repairName = "0541_practice_onsite_diary_admission.sql";
 const repair = readFileSync(new URL(`../migrations/${repairName}`, import.meta.url), "utf8");
 it("is discovered and applied atomically by the migration runner", async () => {
  expect(MIGRATION_URLS.filter(url => url.pathname.endsWith(`/${repairName}`))).toHaveLength(1);
  const queries: string[] = [];
  await migrate({ query: async (query: string, values?: unknown[]) => {
   queries.push(query); return { rows: [], rowCount: values?.[0] === repairName ? 0 : 1 };
  } } as Parameters<typeof migrate>[0]);
  expect(queries.filter(query => query.startsWith(repair.slice(0, 80)))).toEqual([
   repair.replace(/COMMIT;\s*$/u, `INSERT INTO public.jobguard_schema_migration(migration_name) VALUES('${repairName}') ON CONFLICT DO NOTHING;\nCOMMIT;\n`),
  ]);
 });
 it("patches only diary admission in the latest predecessors, retaining LP-5 completion", () => {
  const replacements = [...repair.matchAll(/changed:=replace\(original,'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\);/gu)]
   .map(match => [match[1]!.replaceAll("''", "'"), match[2]!.replaceAll("''", "'")]);
  expect(replacements).toHaveLength(2);
  const latestIntake = readFileSync(new URL("../migrations/0522_lp5b_writers.sql", import.meta.url), "utf8")
   .split("CREATE OR REPLACE FUNCTION app.sv7a_intake_job_source")[1]!.split("END $$;")[0]!;
  const latestCapture = sql.split("CREATE OR REPLACE FUNCTION app.ch4_capture_site_source")[1]!.split("END $$;")[0]!;
  for (const [index, original] of [latestCapture, latestIntake].entries()) {
   const [before, after] = replacements[index]!;
   expect(original.split(before!).length - 1).toBe(1);
   expect(after).toContain("x.practice_session_digest IS NULL");
   expect(after).toContain(index === 0 ? "x.tenant_id=r.tenant_id AND x.id=r.job_id" : "x.tenant_id=t AND x.id=j");
   const changed = original.replace(before!, after!);
   expect(changed.replace(after!, before!)).toBe(original);
   if (index === 1) expect(changed).toContain("app.complete_command(cid,'{}'::jsonb)");
  }
  expect(repair).toContain("IF changed=original THEN RAISE EXCEPTION 'unexpected capture definition'");
  expect(repair).toContain("IF changed=original THEN RAISE EXCEPTION 'unexpected intake definition'");
  expect(repair).not.toMatch(/CREATE OR REPLACE FUNCTION app.ch4_admit_place|\b(?:GRANT|REVOKE)\b/u);
 });
});
