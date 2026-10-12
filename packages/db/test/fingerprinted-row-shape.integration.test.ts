import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

// MIG-ORDER-2 guard: the tables whose WHOLE ROWS are fingerprinted.
//
// An evidence pack stores a canonical encoding of the whole stored row of every source it was built from (to_jsonb(row), keys sorted), and the
// recovery-message boundary re-reads those rows and compares the live to_jsonb(row) with the saved content
// (app.recovery_message_sources_current). So adding, dropping, renaming or reordering a column of one of these tables changes the content of
// every already-approved pack and message source that includes one of its rows, although no value changed. The upgrade proof
// (recovery-follow-up-upgrade.integration.test.ts) deliberately does NOT fail when a later migration adds a column, so this file is the
// guard that does, for exactly the tables where it matters. It pins the exact ordered column list of each, as on origin/main (through 0120).
//
// Evidence, origin/main bbca5ca (every place that serialises a whole row into pack/message content):
//
//   table                          packages/db/src/evidence-pack-sources.ts   0107_recovery_messages.sql (app.recovery_message_sources_current)
//   app.quote_document_version     :39 to_jsonb(d)                            :267 to_jsonb(d)
//   app.quote_acceptance           :39 to_jsonb(a)                            :267 to_jsonb(a)
//   app.evidence_object            :52 to_jsonb(e)                            :272 to_jsonb(e)
//   app.variation_revision         :69 to_jsonb(r)                            :278 to_jsonb(r)
//   app.variation_approval         :69 to_jsonb(a)                            :278 to_jsonb(a)
//   app.recovery_claim_revision    :79 to_jsonb(r)                            :290 to_jsonb(r)
//   app.recovery_case_event        :82 to_jsonb(e)                            :291 to_jsonb(e)
//   app.material_rate_revision     :88 to_jsonb(r)                            :292 to_jsonb(r)
//   app.supplier_document_version  :94 to_jsonb(v)                            :294 to_jsonb(v)
//   app.supplier_document          :94 to_jsonb(d)                            :294 to_jsonb(d)
//   app.customer_invoice           :108 to_jsonb(i)-'pdf_bytes'               :297 to_jsonb(i)-'pdf_bytes' (the bytes travel separately; every other column is in the JSON)
//
// Whole rows kept as a DURABLE RECEIPT (a command result stored and replayed byte for byte):
//
//   app.discrepancy_review_outcome  packages/db/src/discrepancy-repository.ts:23 row_to_json(o) -> view.finding.outcome (kept unchanged, :23);
//                                   finish() (:16) -> storeCommandResult (packages/db/src/watchdog.ts:114-115) -> app.watchdog_command_result.result
//
// Not in this list on purpose: app.extra_origin and app.variation (never serialised whole; only named columns), the audit chain
// (a fixed field set, audit.ts canonicalAuditHash), the practice-feed events (mapped to fixed fields), and the recovery_case read in the 0107
// routine (only case_type and source_refs are used). The receipt (docs/verdicts/MIG-ORDER-2/BUILDER_RECEIPT.md) lists each "checked, not whole-row" site.
// Column NAMES and their order are pinned; column types and row values are not.
// kind "pack": the row is part of an evidence pack / recovery-message source. kind "receipt": the row is stored unchanged in a command receipt.
type Fingerprinted = { table: string; kind: "pack" | "receipt"; places: string; columns: string[] };
const FINGERPRINTED: Fingerprinted[] = [
  { table: "app.quote_document_version", kind: "pack", places: "evidence-pack-sources.ts:39; 0107:267", columns: ["id", "tenant_id", "job_id", "quote_revision_id", "document_version", "reference", "content_hash", "object_key", "object_version_id", "pdf_byte_length", "issuer", "customer", "snapshot", "issued_at", "created_at", "parties_snapshot"] },
  { table: "app.quote_acceptance", kind: "pack", places: "evidence-pack-sources.ts:39; 0107:267", columns: ["id", "tenant_id", "job_id", "document_id", "document_version", "document_hash", "accepted_total_pence", "currency", "acceptance_kind", "actor_membership_id", "stated_customer_name", "stated_method", "accepted_at", "evidence_id", "recorded_at"] },
  { table: "app.evidence_object", kind: "pack", places: "evidence-pack-sources.ts:52; 0107:272", columns: ["id", "tenant_id", "upload_id", "job_id", "scope_item_id", "kind", "original_evidence_id", "evidence_type", "object_key", "object_version_id", "sha256", "byte_length", "content_type", "retention_class", "device_captured_at", "server_received_at", "server_verified_at"] },
  { table: "app.variation_revision", kind: "pack", places: "evidence-pack-sources.ts:69; 0107:278", columns: ["id", "tenant_id", "job_id", "variation_id", "scope_item_id", "revision", "previous_revision_id", "description", "quantity_decimal", "unit", "unit_rate_pence", "signed_delta_pence", "content_hash", "confirmed_by_membership_id", "rate_provenance_kind", "rate_source_ref", "rate_source_hash", "rate_version", "created_at"] },
  { table: "app.variation_approval", kind: "pack", places: "evidence-pack-sources.ts:69; 0107:278", columns: ["id", "tenant_id", "job_id", "variation_id", "revision_id", "revision", "content_hash", "signed_delta_pence", "method", "actor_membership_id", "evidence_id", "approved_at", "created_at"] },
  { table: "app.recovery_claim_revision", kind: "pack", places: "evidence-pack-sources.ts:79; 0107:290", columns: ["id", "tenant_id", "job_id", "case_id", "revision", "claimed_net_pence", "currency", "reviewer_ref", "subject_hash", "previous_hash", "created_at"] },
  { table: "app.recovery_case_event", kind: "pack", places: "evidence-pack-sources.ts:82; 0107:291", columns: ["id", "tenant_id", "job_id", "case_id", "sequence", "event_type", "from_state", "to_state", "amount_pence", "reviewer_ref", "command_id", "payload_hash", "previous_hash", "created_at"] },
  { table: "app.material_rate_revision", kind: "pack", places: "evidence-pack-sources.ts:88; 0107:292", columns: ["id", "tenant_id", "merchant_id", "sku_id", "version", "price_pence", "currency", "price_unit", "tax_basis", "effective_from", "effective_to", "source_label", "created_at", "practice_session_digest"] },
  { table: "app.supplier_document_version", kind: "pack", places: "evidence-pack-sources.ts:94; 0107:294", columns: ["id", "tenant_id", "job_id", "document_id", "version", "media_type", "byte_length", "content_hash", "page_count", "parent_version_id", "page_from", "page_to", "created_at"] },
  { table: "app.supplier_document", kind: "pack", places: "evidence-pack-sources.ts:94; 0107:294", columns: ["id", "tenant_id", "job_id", "supplier_context", "document_type", "document_number", "content_hash", "status", "hold_reason", "recognized_debt_pence", "created_at"] },
  { table: "app.customer_invoice", kind: "pack", places: "evidence-pack-sources.ts:108; 0107:297", columns: ["id", "tenant_id", "job_id", "final_account_revision_id", "authorization_id", "invoice_number", "issued_on", "issuer_details", "tax_policy_version", "currency", "net_pence", "tax_pence", "total_pence", "source_hash", "pdf_sha256", "pdf_bytes", "synthetic", "watermark", "created_at", "parties_snapshot"] },
  { table: "app.discrepancy_review_outcome", kind: "receipt", places: "discrepancy-repository.ts:23 -> :16 finish -> watchdog.ts:114-115 storeCommandResult", columns: ["id", "tenant_id", "job_id", "finding_id", "command_id", "revision", "outcome", "reason", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"] },
];

let postgres: EmbeddedPostgres, admin: Pool, directory: string;
async function liveColumns(tables: string[]) {
  const rows = (await admin.query(`SELECT n.nspname||'.'||c.relname AS name,array_agg(a.attname::text ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relkind='r' AND n.nspname||'.'||c.relname=ANY($1::text[]) GROUP BY 1`, [tables])).rows;
  return Object.fromEntries(rows.map(row => [row.name as string, row.columns as string[]]));
}
const why = (item: Fingerprinted) => item.kind === "receipt"
  ? `Whole rows of ${item.table} are stored unchanged in a durable command receipt (${item.places}); adding, dropping, renaming or reordering a column changes every receipt `
    + "written from then on and no longer matches the ones already stored and replayed. Widen this list only as a deliberate, reviewed change."
  : `Whole rows of ${item.table} are fingerprinted in evidence packs and recovery-message sources (${item.places}); `
    + "adding, dropping, renaming or reordering a column changes already-approved packs. Widen this list only as a deliberate, reviewed change.";
const tablesOf = (kind: Fingerprinted["kind"]) => FINGERPRINTED.filter(item => item.kind === kind).map(item => item.table);

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jg-fingerprint-shape-"));
  const port = await freePort(61700, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"] });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" });
  await migrate(admin); // the whole registry: this guard is about the shape at head, whatever migrations have merged
}, 120_000);
afterAll(async () => { await closeTestPools(admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe("fingerprinted row shape (MIG-ORDER-2)", () => {
  it.each(FINGERPRINTED)("$table keeps its exact ordered column list", async item => {
    expect((await liveColumns([item.table]))[item.table], why(item)).toEqual(item.columns);
  });

  it("each serialisation site reads whole rows of exactly the tables expected of it", async () => {
    const wholeRow = /\b(?:to_jsonb|row_to_json)\(/g;
    const routine = (await admin.query("SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname='recovery_message_sources_current'")).rows;
    expect(routine).toHaveLength(1);
    const source = async (path: string) => readFile(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    // Each site has its own expected set: the two pack/message sites cover the same 11 tables; the receipt site covers the one outcome row.
    const sites: Array<{ name: string; text: string; tables: string[]; kind: Fingerprinted["kind"] }> = [
      { name: "packages/db/src/evidence-pack-sources.ts", text: await source("../src/evidence-pack-sources.ts"), tables: tablesOf("pack"), kind: "pack" },
      { name: "app.recovery_message_sources_current", text: routine[0].prosrc as string, tables: tablesOf("pack"), kind: "pack" },
      { name: "packages/db/src/discrepancy-repository.ts", text: await source("../src/discrepancy-repository.ts"), tables: tablesOf("receipt"), kind: "receipt" },
    ];
    for (const site of sites) {
      const message = `${site.name} now serialises a different number of whole rows than the ${site.tables.length} expected of it: a whole row of another table may now be `
        + `${site.kind === "receipt" ? "stored in a durable receipt" : "fingerprinted"}. Add the table with its exact column list to FINGERPRINTED as a deliberate, reviewed change.`;
      expect((site.text.match(wholeRow) ?? []).length, message).toBe(site.tables.length);
      for (const table of site.tables) {
        const item = FINGERPRINTED.find(candidate => candidate.table === table)!;
        expect(site.text, `${site.name} no longer reads ${table}; ${why(item)}`).toMatch(new RegExp(`\\b${table.replace(".", "\\.")}\\b`));
      }
    }
  });

});
