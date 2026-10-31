import { MIGRATION_URLS } from "../src/migrate.js";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const read = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const sql = read("0536_lp5b_writers.sql");
const routine = (text: string, name: string) => text.slice(text.indexOf(`CREATE OR REPLACE FUNCTION app.${name}(`)).split("END $$;")[0]!;
const section = (text: string, start: string, end: string) => {
 const at = text.indexOf(start); expect(at).toBeGreaterThanOrEqual(0);
 const until = text.indexOf(end, at); expect(until).toBeGreaterThan(at);
 return text.slice(at, until);
};
it("keeps the latest main combined-invoice commercial body and completes only after its effect/audit", () => {
 const name = "issue_lock_bound_customer_invoice", current = routine(sql, name), main = routine(read("0413_j3_combined_invoice.sql"), name);
 expect(section(current," INSERT INTO app.customer_invoice_sequence"," PERFORM app.lp5_bind_effect")).toBe(section(main," INSERT INTO app.customer_invoice_sequence"," INSERT INTO app.command_receipt"));
 expect(section(current," -- Preserve CH-4-C refusal order"," BEGIN\n  lp5_claim")).toBe(section(main," -- Preserve CH-4-C refusal order"," INSERT INTO app.customer_invoice_sequence"));
 expect(current).toContain("app.j3_require_combined_revision(p_tenant,p_job,p_revision,lock_row.id)");
 expect(current).not.toMatch(/(?:INSERT INTO|UPDATE) app\.command_receipt/);
 expect(current.indexOf("app.complete_command")).toBeGreaterThan(current.indexOf("app.append_final_lock_audit"));
 expect(current).toContain("IDEMPOTENCY_PAYLOAD_CONFLICT");
});
it("keeps latest main on-site admission before claim/effects, exact source DTO and current-access replay", () => {
 const name = "sv7a_intake_job_source", current = routine(sql, name), main = routine(read("0505_onsite_diary_admission.sql"), name);
 expect(section(current," -- New writes only below"," IF app.ch4_legacy_command_owned")).toBe(section(main," -- New writes only below"," IF app.ch4_legacy_command_owned"));
 expect(section(current," INSERT INTO app.watchdog_command_identity"," PERFORM app.lp5_bind_effect")).toBe(section(main," INSERT INTO app.watchdog_command_identity"," -- Identifiers and hashes only"));
 expect(current).not.toMatch(/(?:INSERT INTO|UPDATE) app\.command_receipt/);
 const replay = current.slice(current.indexOf(" IF FOUND THEN"),current.indexOf(" -- New writes only below"));
 expect(replay).toContain("app.begin_command"); expect(replay).toContain("RETURN (lp5_claim->'result')");
 expect(current.indexOf("app.complete_command")).toBeGreaterThan(current.indexOf("app.append_final_check_audit"));
 expect(current).toContain("WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN'");
});
it("checks fresh effect identity and the invoice outbox on completion and deferred revalidation", () => {
 const adapter = section(sql," CASE adapter\n"," WHEN 'prevention'");
 for (const marker of ["source_fact.command_id=p_command_id", "source_fact.actor_membership_id=c.actor_membership_id", "source_fact.transaction_id=pg_current_xact_id()::text", "invoice.id=(c.effect_ref->>'invoiceId')::uuid", "binding.revision_id=invoice.final_account_revision_id", "invoice.authorization_id=c.authorization_id", "outbox_row.content_hash=grant_row.content_hash", "outbox_row.immutable_content=convert_from(invoice.pdf_bytes,'UTF8')"]) expect(adapter).toContain(marker);
});

it("discovers the renamed LP block exactly once after the main on-site admission definition", () => {
 const files=MIGRATION_URLS.map(url=>url.pathname.split("/").at(-1)!);
 const main=files.indexOf("0505_onsite_diary_admission.sql"),begin=files.indexOf("0535_lp5a_commands.sql"),writers=files.indexOf("0536_lp5b_writers.sql");
 expect(main).toBeGreaterThan(-1);expect(begin).toBeGreaterThan(main);expect(writers).toBeGreaterThan(begin);
 expect(files.filter(name=>name==="0535_lp5a_commands.sql")).toHaveLength(1);
 expect(files.filter(name=>name==="0536_lp5b_writers.sql")).toHaveLength(1);
 expect(files).not.toContain("0475_lp5a_commands.sql");expect(files).not.toContain("0496_lp5b_writers.sql");
});
