import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { practiceMovementCatalogueV1, type PracticeFeedView } from "@jobguard/core";
import {
  appendAuditBatch, migrate, MIGRATION_URLS, PracticeFeedRepository, PracticeInvoiceRepository, verifiedTenantContextFromMembership, withTenant,
  type VerifiedTenantContext,
} from "../src/index.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { closeTestPools } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const password = "synthetic-feed-test-only";
const membership = { identityUserId: DEMO_IDENTITY_USER_ID, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID };
const context = verifiedTenantContextFromMembership(membership as Parameters<typeof verifiedTenantContextFromMembership>[0]);
const actor = { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID };
const previousJob = randomUUID(), otherTenant = randomUUID();
const command = (expectedRevision: number, extra: Record<string, unknown>) => ({ version: "practice-feed-command.v1", commandId: randomUUID(), expectedRevision, ...extra });
const advance = (expectedRevision: number, movement: string, step: string) => command(expectedRevision, { action: "advance", movement, step });
const repo = (environment = "synthetic_demo") => new PracticeFeedRepository(runtime, environment);
const cmd = (r: PracticeFeedRepository, f: { sessionId: string; jobId: string }, raw: unknown) => r.command(context, actor, f.sessionId, f.jobId, raw);
const view = (f: { sessionId: string; jobId: string }, query?: unknown) => repo().view(context, actor, f.sessionId, f.jobId, query);
const count = async (sql: string, args: unknown[]) => Number((await admin.query(sql, args)).rows[0].n);

type Db = Parameters<Parameters<typeof withTenant>[2]>[0];
async function settings(db: Db, sessionId: string, environment = "synthetic_demo") {
  await db.$client.query("SELECT set_config('app.practice_feed_session',$1,true),set_config('app.practice_feed_environment',$2,true)", [sessionId, environment]);
}
async function fixture() {
  const jobId = randomUUID(), sessionId = randomUUID();
  await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Generated practice job')", [jobId, DEMO_TENANT_ID]);
  return { jobId, sessionId };
}
async function connected() {
  const f = await fixture(), state = await cmd(repo(), f, command(0, { action: "connect" }));
  return { ...f, state };
}
// A real issued practice invoice (£1,320.00) so that builder-attested receipts are recorded through the real routine.
async function invoice(jobId: string) {
  const invoices = new PracticeInvoiceRepository(runtime), quoteId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID();
  await admin.query("UPDATE app.job SET status='live' WHERE id=$1", [jobId]);
  await admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,110000,'accepted')", [quoteId, DEMO_TENANT_ID, jobId, "b".repeat(64)]);
  await admin.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, DEMO_TENANT_ID, jobId]);
  await admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',110000,22000,132000,false,'[]')`, [revisionId, DEMO_TENANT_ID, jobId, draftId, "b".repeat(64), quoteId]);
  await admin.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, draftId, revisionId]);
  const issued = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), recipient: "practice@example.invalid", issuedOn: "2026-09-19" });
  return { invoices, invoiceId: issued.id };
}
async function receipt(f: { jobId: string }, inv: Awaited<ReturnType<typeof invoice>>, amountPence: number) {
  return (await inv.invoices.recordReceipt(context, { jobId: f.jobId, invoiceId: inv.invoiceId, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), paidOn: "2026-09-18", amountPence, method: "bank_transfer", reference: "Fictional receipt" })).paymentId;
}
// Tenant-wide row counts of every table a settled movement must never reach.
const moneyTables = async () => Object.fromEntries(await Promise.all(["landing_allocation", "landing_reversal", "recovery_fee_journal", "recovery_fee_derivation", "synthetic_recovery_receipt", "simulated_settlement_event", "journal", "journal_line"]
  .map(async (table) => [table, await count(`SELECT count(*) n FROM app.${table}`, [])] as const)));
const movement = (state: PracticeFeedView, key: string) => state.movements.find((m) => m.movementKey === key && m.underlyingMovementId === key)!;
const hashOf = (f: { jobId: string }, accountId: string, e: { kind: string; key: string; identity: string; representation: string; pence: number; state: string }) =>
  createHash("sha256").update(["practice-feed-event.v1", "synthetic_demo", DEMO_TENANT_ID, f.jobId, accountId, `${e.kind}-${e.key}`, e.kind, e.key, e.identity, e.representation, e.pence, "GBP", e.state].join("|")).digest("hex");

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jobguard-practice-feed-"));
  const port = 60300 + Math.floor(Math.random() * 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password,
    persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password });
  // Upgrade from exactly the preceding supported schema, retaining a prior job.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, -1)) {
    await admin.query(await readFile(url, "utf8"));
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [fileURLToPath(url).split("/").at(-1)]);
  }
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [DEMO_TENANT_ID, otherTenant]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Generated practice account')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Previous schema job')", [previousJob, DEMO_TENANT_ID]);
  await migrate(admin); await migrate(admin);
  await admin.query("CREATE ROLE practice_feed_test_login LOGIN PASSWORD 'synthetic-feed-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO practice_feed_test_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "practice_feed_test_login", password, max: 8 });
}, 90_000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe("M4-7-S real PostgreSQL practice feed", () => {
  it("upgrades from 0042, preserves prior rows and applies 0046 exactly once without taking 0043-0045", async () => {
    expect((await admin.query("SELECT title FROM app.job WHERE id=$1", [previousJob])).rows[0].title).toBe("Previous schema job");
    const names = (await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map((row) => row.migration_name);
    expect(names).toHaveLength(44); expect(names.at(-1)).toBe("0046_practice_feed.sql"); expect(names.at(-2)).toBe("0042_evidence_pack_repair.sql");
    expect(names.filter((name) => /^004[3-5]/u.test(name))).toEqual([]);
    expect(await count("SELECT count(*) n FROM app.practice_feed_account", [])).toBeGreaterThanOrEqual(0);
  });

  it("gives every fixed catalogue movement a durable identity with its exact pence, in one feed", async () => {
    const f = await connected(); let state = f.state;
    expect(state).toMatchObject({ feedState: "connected", consent: { version: "practice-feed-consent.v1", scope: "read_generated_movements", provider: "none", grantedAtRevision: 1, revokedAtRevision: null } });
    expect(state.catalogue.map((entry) => entry.movement)).toEqual(practiceMovementCatalogueV1.map((entry) => entry.movement));
    for (const entry of practiceMovementCatalogueV1) state = await cmd(repo(), f, advance(state.revision, entry.movement, "settled"));
    expect(state.movements.map((m) => [m.movementKey, m.grossPence, m.kind, m.state, m.id])).toEqual(
      practiceMovementCatalogueV1.map((entry) => [entry.movement, entry.grossPence, entry.kind, "settled", `${state.accountId}:${entry.movement}`]));
    expect(state.movementCount).toBe(7); expect(state.allocatedEligibleNetPence).toBe(0);
    expect(state.movements.every((m) => m.allocatedEligibleNetPence === 0)).toBe(true);
    const stored = (await admin.query("SELECT movement_key,gross_pence::int8 p FROM app.practice_feed_event WHERE job_id=$1 ORDER BY movement_key", [f.jobId])).rows;
    expect(stored.map((row) => [row.movement_key, Number(row.p)]).sort()).toEqual(practiceMovementCatalogueV1.map((entry) => [entry.movement, entry.grossPence]).sort());
    expect(await view(f)).toEqual(state);
  });

  it("persists pending £384, then its settlement as the same movement, without any allocation, landing or fee", async () => {
    const before = await moneyTables();
    const f = await connected();
    let state = await cmd(repo(), f, advance(1, "receipt-384", "pending"));
    expect(movement(state, "receipt-384")).toMatchObject({ grossPence: 38_400, state: "pending", eligibleForAllocation: false, allocatedEligibleNetPence: 0 });
    const id = movement(state, "receipt-384").id;
    state = await cmd(repo(), f, advance(state.revision, "receipt-384", "settled"));
    expect(movement(state, "receipt-384")).toMatchObject({ id, state: "settled", allocatedEligibleNetPence: 0, eventIds: ["pending-receipt-384", "settled-receipt-384"] });
    expect(await view(f)).toEqual(state);
    const rows = (await admin.query("SELECT source_hash FROM app.practice_feed_event WHERE job_id=$1 ORDER BY created_at,event_id", [f.jobId])).rows;
    expect(movement(state, "receipt-384").sourceHashes.sort()).toEqual(rows.map((row) => row.source_hash).sort());
    expect(await moneyTables(), "no allocation, landing, fee or ledger row appears").toEqual(before);
  });

  it("replays, overlapping pages, known alternate representations and a late pending event keep one movement", async () => {
    const f = await connected(), settle = advance(1, "receipt-3000", "settled");
    let state = await cmd(repo(), f, settle);
    expect(await cmd(repo(), f, settle)).toEqual(state);
    await expect(cmd(repo(), f, { ...settle, step: "pending" })).rejects.toMatchObject({ code: "IDEMPOTENCY_PAYLOAD_CONFLICT" });
    for (const step of ["replay", "page_overlap", "alternate_representation", "pending"]) state = await cmd(repo(), f, advance(state.revision, "receipt-3000", step));
    expect(state.movements).toHaveLength(1); expect(state.movements[0]!.state).toBe("settled"); expect(state.eventCount).toBe(3);
    expect(await count("SELECT count(*) n FROM app.practice_feed_event WHERE job_id=$1", [f.jobId])).toBe(3);
    expect(await count("SELECT count(*) n FROM app.practice_feed_command WHERE job_id=$1", [f.jobId])).toBe(6);
  });

  it("holds an unidentified duplicate, paginates authoritatively and reconciles without losing any past fact", async () => {
    const f = await connected();
    let state = await cmd(repo(), f, advance(1, "receipt-384", "settled"));
    await expect(cmd(repo(), f, advance(state.revision, "receipt-960", "unknown_duplicate"))).rejects.toMatchObject({ code: "PRACTICE_FEED_SETTLEMENT_REQUIRED" });
    state = await cmd(repo(), f, advance(state.revision, "receipt-384", "unknown_duplicate"));
    expect(state.movements.map((m) => [m.underlyingMovementId, m.state, m.eligibleForAllocation])).toEqual([["receipt-384", "settled", false], ["unresolved-receipt-384", "possible_duplicate", false]]);
    const first = await view(f, { version: "practice-feed-query.v1", limit: 1 });
    expect(first.nextCursor).toBe("1"); expect(first.movementCount).toBe(2);
    const second = await view(f, { version: "practice-feed-query.v1", limit: 1, cursor: first.nextCursor });
    expect(second.movements[0]!.state).toBe("possible_duplicate"); expect(second.nextCursor).toBeNull();
    await expect(cmd(repo(), f, command(state.revision, { action: "reconcile_duplicate", movement: "receipt-960" }))).rejects.toMatchObject({ code: "PRACTICE_FEED_DUPLICATE_NOT_FOUND" });
    state = await cmd(repo(), f, command(state.revision, { action: "reconcile_duplicate", movement: "receipt-384" }));
    expect(state.movements).toHaveLength(1);
    expect(state.movements[0]).toMatchObject({ eligibleForAllocation: true, allocatedEligibleNetPence: 0, eventIds: ["settled-receipt-384", "unknown-receipt-384"] });
    expect(state.eventCount).toBe(2);
    await expect(cmd(repo(), f, command(state.revision, { action: "reconcile_duplicate", movement: "receipt-384" }))).rejects.toMatchObject({ code: "PRACTICE_FEED_DUPLICATE_NOT_FOUND" });
  });

  it("qualifies a builder-attested £384 receipt only once matched to a settled movement, never allocating anything", async () => {
    const f = await connected(), inv = await invoice(f.jobId), paymentId = await receipt(f, inv, 38_400);
    let state = await view(f);
    expect(state.receipts).toMatchObject([{ paymentId, amountPence: 38_400, reversed: false, assessment: { status: "attested_only", reason: "no_movement_yet", canMatch: false, candidateMovementKey: "receipt-384" } }]);
    const match = (revision: number) => command(revision, { action: "match_receipt", movement: "receipt-384", paymentId });
    await expect(cmd(repo(), f, match(state.revision))).rejects.toMatchObject({ code: "PRACTICE_FEED_MOVEMENT_NOT_SETTLED" });
    state = await cmd(repo(), f, advance(state.revision, "receipt-384", "pending"));
    expect(state.receipts[0]!.assessment).toMatchObject({ status: "attested_only", reason: "pending", canMatch: false });
    await expect(cmd(repo(), f, match(state.revision))).rejects.toMatchObject({ code: "PRACTICE_FEED_MOVEMENT_NOT_SETTLED" });
    state = await cmd(repo(), f, advance(state.revision, "receipt-384", "settled"));
    expect(state.receipts[0]!.assessment).toMatchObject({ status: "attested_only", reason: "ready_to_match", canMatch: true });
    const matching = match(state.revision);
    state = await cmd(repo(), f, matching);
    expect(state.receipts[0]!.assessment).toMatchObject({ status: "qualifies", reason: "matched", matchedMovementKey: "receipt-384", canMatch: false });
    expect(await cmd(repo(), f, matching)).toEqual(state);
    expect(state.allocatedEligibleNetPence).toBe(0); expect(movement(state, "receipt-384").allocatedEligibleNetPence).toBe(0);
    expect(await view(f)).toEqual(state);
    // The builder's own record is untouched: it never becomes qualifying recovery proof or fee settlement in the payment table.
    expect((await admin.query("SELECT builder_attested,qualifying_recovery_proof,platform_fee_settlement FROM app.customer_payment WHERE id=$1", [paymentId])).rows[0])
      .toEqual({ builder_attested: true, qualifying_recovery_proof: false, platform_fee_settlement: false });
    expect(await count("SELECT count(*) n FROM app.landing_allocation WHERE job_id=$1", [f.jobId])).toBe(0);
    // One movement verifies one receipt only; a second receipt of the same amount cannot also qualify.
    const second = await receipt(f, inv, 38_400);
    await expect(cmd(repo(), f, command(state.revision, { action: "match_receipt", movement: "receipt-384", paymentId: second }))).rejects.toMatchObject({ code: "PRACTICE_FEED_RECEIPT_ALREADY_MATCHED" });
    expect((await view(f)).receipts.find((r) => r.paymentId === second)!.assessment).toMatchObject({ status: "attested_only", reason: "movement_already_matched" });
    // Reversing the builder's receipt withdraws qualification; the saved match stays as history.
    await inv.invoices.reverseReceipt(context, { jobId: f.jobId, invoiceId: inv.invoiceId, paymentId, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), reason: "Fictional duplicate corrected" });
    const after = await view(f);
    expect(after.receipts.find((r) => r.paymentId === paymentId)!).toMatchObject({ reversed: true, assessment: { status: "reversed", canMatch: false } });
    expect(await count("SELECT count(*) n FROM app.practice_feed_receipt_match WHERE job_id=$1", [f.jobId])).toBe(1);
    // The reversed receipt's match is history and keeps its movement used: the corrected receipt gets a distinct, honest explanation.
    expect(after.receipts.find((r) => r.paymentId === second)!.assessment).toMatchObject({ status: "attested_only", reason: "movement_used_by_reversed_receipt", canMatch: false });
    await expect(cmd(repo(), f, command(after.revision, { action: "match_receipt", movement: "receipt-384", paymentId: second }))).rejects.toMatchObject({ code: "PRACTICE_FEED_RECEIPT_ALREADY_MATCHED" });
  });

  it("a duplicate that arrives after a match holds the receipt (history kept) until it is reconciled, then it qualifies again", async () => {
    const f = await connected(), inv = await invoice(f.jobId), paymentId = await receipt(f, inv, 38_400);
    let state = await cmd(repo(), f, advance(1, "receipt-384", "settled"));
    state = await cmd(repo(), f, command(state.revision, { action: "match_receipt", movement: "receipt-384", paymentId }));
    expect(state.receipts[0]!.assessment).toMatchObject({ status: "qualifies", reason: "matched" });
    state = await cmd(repo(), f, advance(state.revision, "receipt-384", "unknown_duplicate"));
    expect(state.receipts[0]!.assessment).toMatchObject({ status: "attested_only", reason: "duplicate_held", canMatch: false, matchedMovementKey: "receipt-384" });
    expect(await count("SELECT count(*) n FROM app.practice_feed_receipt_match WHERE job_id=$1", [f.jobId])).toBe(1);
    state = await cmd(repo(), f, command(state.revision, { action: "reconcile_duplicate", movement: "receipt-384" }));
    expect(state.receipts[0]!.assessment).toMatchObject({ status: "qualifies", reason: "matched", matchedMovementKey: "receipt-384" });
    expect(await count("SELECT count(*) n FROM app.practice_feed_receipt_match WHERE job_id=$1", [f.jobId])).toBe(1);
  });

  it("refuses to match receipts of the wrong amount, a reversed receipt, a held duplicate, another job's receipt and a supplier refund", async () => {
    const f = await connected(), inv = await invoice(f.jobId), other = await fixture(), otherInv = await invoice(other.jobId);
    let state = await cmd(repo(), f, advance(1, "receipt-384", "settled"));
    const wrong = await receipt(f, inv, 38_500), reversed = await receipt(f, inv, 38_400), foreign = await receipt(other, otherInv, 38_400);
    await expect(cmd(repo(), f, command(state.revision, { action: "match_receipt", movement: "receipt-384", paymentId: wrong }))).rejects.toMatchObject({ code: "PRACTICE_FEED_RECEIPT_MISMATCH" });
    await inv.invoices.reverseReceipt(context, { jobId: f.jobId, invoiceId: inv.invoiceId, paymentId: reversed, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), reason: "Fictional receipt corrected" });
    await expect(cmd(repo(), f, command(state.revision, { action: "match_receipt", movement: "receipt-384", paymentId: reversed }))).rejects.toMatchObject({ code: "PRACTICE_FEED_RECEIPT_MISMATCH" });
    await expect(cmd(repo(), f, command(state.revision, { action: "match_receipt", movement: "receipt-384", paymentId: foreign }))).rejects.toMatchObject({ code: "PRACTICE_FEED_RECEIPT_MISMATCH" });
    await expect(cmd(repo(), f, command(state.revision, { action: "match_receipt", movement: "supplier-refund-540", paymentId: wrong }))).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    // A good receipt, but its movement is held as a possible duplicate until reconciled.
    const good = await receipt(f, inv, 38_400);
    state = await cmd(repo(), f, advance(state.revision, "receipt-384", "unknown_duplicate"));
    expect((await view(f)).receipts.find((r) => r.paymentId === good)!.assessment).toMatchObject({ reason: "duplicate_held", canMatch: false });
    await expect(cmd(repo(), f, command(state.revision, { action: "match_receipt", movement: "receipt-384", paymentId: good }))).rejects.toMatchObject({ code: "PRACTICE_FEED_DUPLICATE_HELD" });
    state = await cmd(repo(), f, command(state.revision, { action: "reconcile_duplicate", movement: "receipt-384" }));
    state = await cmd(repo(), f, command(state.revision, { action: "match_receipt", movement: "receipt-384", paymentId: good }));
    expect(state.receipts.find((r) => r.paymentId === good)!.assessment.status).toBe("qualifies");
    expect(await count("SELECT count(*) n FROM app.practice_feed_receipt_match WHERE job_id=$1", [f.jobId])).toBe(1);
  });

  it("disconnect is durable, revokes consent, preserves every fact and refuses new ingestion, matches and a second disconnect", async () => {
    const f = await connected(), inv = await invoice(f.jobId), paymentId = await receipt(f, inv, 38_400);
    let state = await cmd(repo(), f, advance(1, "receipt-384", "settled"));
    const movements = state.movements;
    state = await cmd(repo(), f, command(state.revision, { action: "disconnect" }));
    expect(state).toMatchObject({ feedState: "disconnected", consent: { grantedAtRevision: 1, revokedAtRevision: state.revision } });
    expect(state.movements).toEqual(movements);
    for (const raw of [advance(state.revision, "receipt-384", "settled"), command(state.revision, { action: "match_receipt", movement: "receipt-384", paymentId }), command(state.revision, { action: "disconnect" })]) {
      await expect(cmd(repo(), f, raw)).rejects.toMatchObject({ code: "PRACTICE_FEED_DISCONNECTED" });
    }
    expect((await view(f)).movements).toEqual(movements);
    expect(await count("SELECT count(*) n FROM app.practice_feed_event WHERE job_id=$1", [f.jobId])).toBe(1);
  });

  it("competing browsers create one account/effect or a typed stale-revision conflict", async () => {
    const f = await fixture(), input = command(0, { action: "connect" });
    const results = await Promise.all([cmd(repo(), f, input), cmd(repo(), f, input)]);
    expect(results[0]!.accountId).toBe(results[1]!.accountId);
    const race = await Promise.allSettled(["pending", "settled"].map((step) => cmd(repo(), f, advance(1, "receipt-384", step))));
    expect(race.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(race.find((row) => row.status === "rejected")).toMatchObject({ reason: { code: "PRACTICE_FEED_STALE_REVISION" } });
    expect(await count("SELECT count(*) n FROM app.practice_feed_command WHERE job_id=$1", [f.jobId])).toBe(2);
    expect(await count("SELECT count(*) n FROM app.audit_event WHERE subject_ref=$1 AND event_type IN('practice_feed.connect','practice_feed.advance')", [f.jobId])).toBe(2);
    expect(await count("SELECT count(*) n FROM app.audit_event WHERE subject_ref=$1 AND event_type='practice_feed.claimed'", [f.jobId])).toBe(1);
  });

  it("refuses a foreign session, a non-member tenant/job, forged fields and a revoked or expired membership", async () => {
    const f = await connected(), otherJob = randomUUID();
    await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Foreign')", [otherJob, otherTenant]);
    await expect(repo().view(context, actor, randomUUID(), f.jobId)).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
    await expect(cmd(repo(), { sessionId: randomUUID(), jobId: f.jobId }, command(1, { action: "disconnect" }))).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
    await expect(view({ sessionId: f.sessionId, jobId: otherJob })).rejects.toMatchObject({ code: "PRACTICE_FEED_NOT_FOUND" });
    await expect(repo().view(context, { ...actor, identityUserId: randomUUID() }, f.sessionId, f.jobId)).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
    for (const key of ["tenantId", "accountId", "eventId", "grossPence", "amountPence", "state", "environment", "movementId"]) {
      await expect(cmd(repo(), f, { ...advance(1, "receipt-384", "settled"), [key]: "forged" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    }
    for (const field of ["revoked_at", "expires_at"]) {
      await admin.query(`UPDATE app.membership SET ${field}=now()-interval '1 hour' WHERE id=$1`, [DEMO_MEMBERSHIP_ID]);
      try {
        await expect(view(f)).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
        await expect(cmd(repo(), f, command(1, { action: "disconnect" }))).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
      } finally { await admin.query(`UPDATE app.membership SET ${field}=NULL WHERE id=$1`, [DEMO_MEMBERSHIP_ID]); }
    }
    expect(await count("SELECT count(*) n FROM app.practice_feed_event WHERE job_id=$1", [f.jobId])).toBe(0);
  });

  it("refuses production, pilot and unconfigured deployment environments; a no-charge practice job in the synthetic environment is allowed", async () => {
    const f = await connected();
    for (const environment of ["production", "production_billing", "pilot_no_charge", "provider_sandbox", "unconfigured"]) {
      await expect(repo(environment).view(context, actor, f.sessionId, f.jobId)).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
      await expect(cmd(repo(environment), f, advance(1, "receipt-384", "settled"))).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
    }
    expect(await count("SELECT count(*) n FROM app.practice_feed_event WHERE job_id=$1", [f.jobId])).toBe(0);
    // The practice sandbox itself starts jobs as pilot_no_charge (its no-charge scenario), so a job's activation mode cannot be what
    // refuses pilot use: the deployment environment is. An activated practice job therefore works in the synthetic environment.
    const client = await admin.connect();
    try {
      // Privileged fixture only: the activation row without the unrelated quote workflow.
      await client.query("SET session_replication_role=replica");
      await client.query(`INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)
        VALUES($1,$2,$3,$4,1,$5,'pilot_no_charge','pilot_no_charge.v1','reference_fee_policy_v1',$6,now())`, [randomUUID(), DEMO_TENANT_ID, f.jobId, randomUUID(), "a".repeat(64), DEMO_MEMBERSHIP_ID]);
    } finally { await client.query("SET session_replication_role=origin"); client.release(); }
    const state = await cmd(repo(), f, advance(1, "receipt-384", "settled"));
    expect(movement(state, "receipt-384").state).toBe("settled");
    // ...while the same database refuses the write when the environment setting is not the synthetic one, even for raw SQL.
    await expect(withTenant(runtime, context, async (db) => {
      await settings(db, f.sessionId, "pilot_no_charge");
      await db.$client.query(`INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,actor_membership_id,payload_hash,environment) VALUES($1,$2,$3,$4,3,'disconnect',$5,$6,'synthetic_demo')`,
        [randomUUID(), DEMO_TENANT_ID, f.jobId, state.accountId, DEMO_MEMBERSHIP_ID, "d".repeat(64)]);
    })).rejects.toThrow("PRACTICE_FEED_FORBIDDEN");
    expect(await count("SELECT count(*) n FROM app.practice_feed_command WHERE job_id=$1", [f.jobId])).toBe(2);
  });

  describe("actual runtime SQL cannot forge facts", () => {
    const eventSql = `INSERT INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GBP',$12,$13,'practice-feed-event.v1',$14)`;
    type Forge = { kind: string; key: string; identity: string; representation: string; pence: number; state: string; eventId?: string; tenantId?: string; jobId?: string; accountId?: string; commandId?: string; environment?: string; hash?: string; session?: string };
    const settled: Forge = { kind: "settled", key: "receipt-384", identity: "identified", representation: "feed", pence: 38_400, state: "settled" };
    async function setup() {
      const f = await connected(), other = await connected();
      const first = await cmd(repo(), f, advance(1, "receipt-384", "pending"));
      const latest = (await admin.query("SELECT id FROM app.practice_feed_command WHERE job_id=$1 ORDER BY revision DESC LIMIT 1", [f.jobId])).rows[0].id as string;
      return { f, other, accountId: first.accountId!, latest };
    }
    const insert = (ctx: Awaited<ReturnType<typeof setup>>, forge: Forge) => withTenant(runtime, context, async (db) => {
      await settings(db, forge.session ?? ctx.f.sessionId);
      const hash = forge.hash ?? hashOf(ctx.f, ctx.accountId, forge);
      return db.$client.query(eventSql, [randomUUID(), forge.tenantId ?? DEMO_TENANT_ID, forge.jobId ?? ctx.f.jobId, forge.accountId ?? ctx.accountId, forge.commandId ?? ctx.latest,
        forge.kind, forge.key, forge.eventId ?? `${forge.kind}-${forge.key}`, forge.identity, forge.representation, forge.pence, forge.state, forge.environment ?? "synthetic_demo", hash]);
    });
    it("the generated form reaches the uniqueness check (control), every forged variation is stopped earlier", async () => {
      const ctx = await setup();
      const pending: Forge = { kind: "pending", key: "receipt-384", identity: "identified", representation: "feed", pence: 38_400, state: "pending" };
      await expect(insert(ctx, pending)).rejects.toMatchObject({ code: "23505" });
      const forged: Array<[string, Forge, string | RegExp]> = [
        ["settlement not authorised by a pending command", settled, "PRACTICE_FEED_EVENT_INVALID"],
        ["wrong amount", { ...pending, pence: 38_500 }, /check constraint|PRACTICE_FEED_EVENT_INVALID/u],
        ["another movement than the command names", { kind: "pending", key: "receipt-3000", identity: "identified", representation: "feed", pence: 300_000, state: "pending" }, "PRACTICE_FEED_EVENT_INVALID"],
        ["state not matching the kind", { ...pending, state: "settled" }, /check constraint|PRACTICE_FEED_EVENT_INVALID/u],
        ["event id not the generated identity", { ...pending, eventId: "pending-forged" }, /check constraint|PRACTICE_FEED_EVENT_INVALID/u],
        ["unlisted movement", { ...pending, key: "receipt-999", eventId: "pending-receipt-999" }, /check constraint|PRACTICE_FEED_EVENT_INVALID/u],
        ["production environment", { ...pending, environment: "production" }, /check constraint|PRACTICE_FEED_EVENT_INVALID/u],
        ["production billing environment", { ...pending, environment: "production_billing" }, /check constraint|PRACTICE_FEED_EVENT_INVALID/u],
        ["pilot environment", { ...pending, environment: "pilot_no_charge" }, /check constraint|PRACTICE_FEED_EVENT_INVALID/u],
        ["wrong integrity hash", { ...pending, hash: "a".repeat(64) }, "PRACTICE_FEED_EVENT_INVALID"],
        ["another account", { ...pending, accountId: ctx.other.state.accountId! }, /foreign key|PRACTICE_FEED_FORBIDDEN/u],
        ["another job", { ...pending, jobId: ctx.other.jobId }, /foreign key|PRACTICE_FEED_FORBIDDEN/u],
        ["another tenant", { ...pending, tenantId: otherTenant }, /row-level security|PRACTICE_FEED_FORBIDDEN/u],
        ["another session", { ...pending, session: randomUUID() }, "PRACTICE_FEED_FORBIDDEN"],
        ["a stale command", { ...pending, commandId: ctx.other.state.accountId! }, /foreign key|PRACTICE_FEED_FORBIDDEN/u],
      ];
      for (const [label, forge, expected] of forged) await expect(insert(ctx, forge), label).rejects.toThrow(expected);
      expect((await view(ctx.f)).movements[0]!.state).toBe("pending");
      expect(await count("SELECT count(*) n FROM app.practice_feed_event WHERE job_id=$1", [ctx.f.jobId])).toBe(1);
      expect((await runtime.query("SELECT * FROM app.practice_feed_event")).rowCount).toBe(0);
      expect((await withTenant(runtime, { tenantId: otherTenant } as VerifiedTenantContext, (db) => db.$client.query("SELECT * FROM app.practice_feed_event"))).rowCount).toBe(0);
    });
    it("refuses events outside a synthetic environment setting and with no session setting", async () => {
      const ctx = await setup();
      await expect(withTenant(runtime, context, async (db) => {
        await settings(db, ctx.f.sessionId, "production_billing");
        return db.$client.query(eventSql, [randomUUID(), DEMO_TENANT_ID, ctx.f.jobId, ctx.accountId, ctx.latest, "pending", "receipt-384", "pending-receipt-384", "identified", "feed", 38_400, "pending", "synthetic_demo", hashOf(ctx.f, ctx.accountId, { ...settled, kind: "pending", state: "pending" })]);
      })).rejects.toThrow("PRACTICE_FEED_FORBIDDEN");
      await expect(withTenant(runtime, context, (db) => db.$client.query(eventSql, [randomUUID(), DEMO_TENANT_ID, ctx.f.jobId, ctx.accountId, ctx.latest, "pending", "receipt-384", "pending-receipt-384", "identified", "feed", 38_400, "pending", "synthetic_demo", "a".repeat(64)]))).rejects.toThrow("PRACTICE_FEED_FORBIDDEN");
    });
    it("refuses a raw receipt match for a pending movement, a wrong amount, a reversed or foreign receipt and a duplicate", async () => {
      const f = await connected(), inv = await invoice(f.jobId), other = await fixture(), otherInv = await invoice(other.jobId);
      const good = await receipt(f, inv, 38_400), wrong = await receipt(f, inv, 38_500), reversed = await receipt(f, inv, 38_400), foreign = await receipt(other, otherInv, 38_400);
      await inv.invoices.reverseReceipt(context, { jobId: f.jobId, invoiceId: inv.invoiceId, paymentId: reversed, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), reason: "Fictional receipt corrected" });
      let state = await cmd(repo(), f, advance(1, "receipt-384", "pending"));
      const accountId = state.accountId!;
      const rawMatch = (revision: number, paymentId: string, extra: { pence?: number; settledEventId?: string; commandMovement?: string; commandPayment?: string; commandJob?: string } = {}) => withTenant(runtime, context, async (db) => {
        await settings(db, f.sessionId);
        const commandId = randomUUID();
        await db.$client.query(`INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,movement_key,payment_id,actor_membership_id,payload_hash,environment)
          VALUES($1,$2,$3,$4,$5,'match_receipt',$6,$7,$8,$9,'synthetic_demo')`, [commandId, DEMO_TENANT_ID, extra.commandJob ?? f.jobId, accountId, revision, extra.commandMovement ?? "receipt-384", extra.commandPayment ?? paymentId, DEMO_MEMBERSHIP_ID, "c".repeat(64)]);
        return db.$client.query(`INSERT INTO app.practice_feed_receipt_match(id,tenant_id,job_id,account_id,command_id,payment_id,movement_key,settled_event_id,matched_pence,currency,environment)
          VALUES($1,$2,$3,$4,$5,$6,'receipt-384',$7,$8,'GBP','synthetic_demo')`, [randomUUID(), DEMO_TENANT_ID, f.jobId, accountId, commandId, paymentId, extra.settledEventId ?? "settled-receipt-384", extra.pence ?? 38_400]);
      });
      await expect(rawMatch(state.revision + 1, good)).rejects.toThrow(/foreign key|PRACTICE_FEED_MOVEMENT_NOT_SETTLED/u);
      state = await cmd(repo(), f, advance(state.revision, "receipt-384", "settled"));
      await expect(rawMatch(state.revision + 1, good, { settledEventId: "pending-receipt-384" })).rejects.toThrow("PRACTICE_FEED_MOVEMENT_NOT_SETTLED");
      await expect(rawMatch(state.revision + 1, wrong, { pence: 38_500 })).rejects.toThrow(/check constraint/u);
      await expect(rawMatch(state.revision + 1, wrong)).rejects.toThrow("PRACTICE_FEED_RECEIPT_MISMATCH");
      await expect(rawMatch(state.revision + 1, reversed)).rejects.toThrow("PRACTICE_FEED_RECEIPT_MISMATCH");
      await expect(rawMatch(state.revision + 1, foreign)).rejects.toThrow(/foreign key|PRACTICE_FEED_RECEIPT_MISMATCH/u);
      await expect(rawMatch(state.revision + 1, good, { commandMovement: "receipt-3000" })).rejects.toThrow(/PRACTICE_FEED_FORBIDDEN/u);
      await expect(rawMatch(state.revision + 1, good, { commandPayment: wrong })).rejects.toThrow(/PRACTICE_FEED_FORBIDDEN/u);
      const dup = await cmd(repo(), f, advance(state.revision, "receipt-384", "unknown_duplicate"));
      await expect(rawMatch(dup.revision + 1, good)).rejects.toThrow("PRACTICE_FEED_DUPLICATE_HELD");
      expect(await count("SELECT count(*) n FROM app.practice_feed_receipt_match WHERE job_id=$1", [f.jobId])).toBe(0);
    });
    it("rejects an orphan account, an un-audited command and a match command with no match row, rolling everything back", async () => {
      const f = await fixture();
      await view(f); // the first touch binds the job to this session
      await expect(withTenant(runtime, context, async (db) => {
        await settings(db, f.sessionId);
        await db.$client.query("INSERT INTO app.practice_feed_account(id,tenant_id,job_id,session_id,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,'synthetic_demo')", [randomUUID(), DEMO_TENANT_ID, f.jobId, f.sessionId, DEMO_MEMBERSHIP_ID]);
      })).rejects.toThrow("PRACTICE_FEED_CONNECTION_REQUIRED");
      expect((await view(f)).feedState).toBe("not_connected");
      const c = await connected();
      await expect(withTenant(runtime, context, async (db) => {
        await settings(db, c.sessionId);
        await db.$client.query("INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,actor_membership_id,payload_hash,environment) VALUES($1,$2,$3,$4,2,'disconnect',$5,$6,'synthetic_demo')",
          [randomUUID(), DEMO_TENANT_ID, c.jobId, c.state.accountId, DEMO_MEMBERSHIP_ID, createHash("sha256").update("synthetic").digest("hex")]);
      })).rejects.toThrow("PRACTICE_FEED_AUDIT_REQUIRED");
      expect((await view(c)).feedState).toBe("connected");
      expect(await count("SELECT count(*) n FROM app.practice_feed_command WHERE job_id=$1", [c.jobId])).toBe(1);
    });
  });

  describe("session ownership of a job is persisted before any connection", () => {
    const sandboxRun = async (jobId: string, sessionId: string) => admin.query(
      "INSERT INTO app.sandbox_run(id,tenant_id,job_id,session_id,scenario,environment,status) VALUES($1,$2,$3,$4,'core-1000','synthetic_demo','active')", [randomUUID(), DEMO_TENANT_ID, jobId, sessionId]);
    it("the first session to touch a job owns it: another session is refused before it connects, for reads and for the first connection", async () => {
      const f = await fixture(), intruder = randomUUID();
      const inv = await invoice(f.jobId); await receipt(f, inv, 38_400);
      const first = await view(f);
      expect(first.feedState).toBe("not_connected"); expect(first.receipts).toHaveLength(1);
      const owners = (await admin.query("SELECT session_id,actor_membership_id,environment FROM app.practice_feed_job_owner WHERE job_id=$1", [f.jobId])).rows;
      expect(owners).toEqual([{ session_id: f.sessionId, actor_membership_id: DEMO_MEMBERSHIP_ID, environment: "synthetic_demo" }]);
      expect(await count("SELECT count(*) n FROM app.audit_event WHERE subject_ref=$1 AND event_type='practice_feed.claimed'", [f.jobId])).toBe(1);
      await expect(repo().view(context, actor, intruder, f.jobId)).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
      await expect(cmd(repo(), { sessionId: intruder, jobId: f.jobId }, command(0, { action: "connect" }))).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
      expect(await count("SELECT count(*) n FROM app.practice_feed_account WHERE job_id=$1", [f.jobId])).toBe(0);
      // The owner is unaffected, and touching the job again is idempotent (one owner row, one claim audit).
      expect((await view(f)).receipts).toHaveLength(1);
      const state = await cmd(repo(), f, command(0, { action: "connect" }));
      expect(state.feedState).toBe("connected");
      expect(await count("SELECT count(*) n FROM app.practice_feed_job_owner WHERE job_id=$1", [f.jobId])).toBe(1);
      expect(await count("SELECT count(*) n FROM app.audit_event WHERE subject_ref=$1 AND event_type='practice_feed.claimed'", [f.jobId])).toBe(1);
    });
    it("two sessions racing for an unowned job give exactly one owner and one typed refusal", async () => {
      const f = await fixture(), rival = randomUUID();
      const race = await Promise.allSettled([repo().view(context, actor, f.sessionId, f.jobId), repo().view(context, actor, rival, f.jobId)]);
      expect(race.filter((row) => row.status === "fulfilled")).toHaveLength(1);
      expect(race.find((row) => row.status === "rejected")).toMatchObject({ reason: { code: "PRACTICE_FEED_FORBIDDEN" } });
      expect(await count("SELECT count(*) n FROM app.practice_feed_job_owner WHERE job_id=$1", [f.jobId])).toBe(1);
    });
    it("a job that belongs to a sandbox run can only be claimed by that run's session", async () => {
      const f = await fixture(), owner = randomUUID();
      await sandboxRun(f.jobId, owner);
      await expect(view(f)).rejects.toMatchObject({ code: "PRACTICE_FEED_FORBIDDEN" });
      expect(await count("SELECT count(*) n FROM app.practice_feed_job_owner WHERE job_id=$1", [f.jobId])).toBe(0);
      expect((await view({ sessionId: owner, jobId: f.jobId })).feedState).toBe("not_connected");
      // Raw SQL claim by another session is refused by the database as well.
      const g = await fixture(), ownerG = randomUUID();
      await sandboxRun(g.jobId, ownerG);
      await expect(withTenant(runtime, context, async (db) => {
        await settings(db, g.sessionId);
        await db.$client.query("INSERT INTO app.practice_feed_job_owner(id,tenant_id,job_id,session_id,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,'synthetic_demo')", [randomUUID(), DEMO_TENANT_ID, g.jobId, g.sessionId, DEMO_MEMBERSHIP_ID]);
      })).rejects.toThrow("PRACTICE_FEED_FORBIDDEN");
    });
    it("runtime SQL cannot add a second owner, bind an account to another session, claim another tenant's or a non-synthetic way, or skip the audit", async () => {
      const f = await fixture(); await view(f);
      const other = randomUUID();
      const claim = (jobId: string, session: string, extra: { tenantId?: string; environment?: string; actor?: string } = {}) => withTenant(runtime, context, async (db) => {
        await settings(db, session, extra.environment ?? "synthetic_demo");
        await db.$client.query("INSERT INTO app.practice_feed_job_owner(id,tenant_id,job_id,session_id,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,'synthetic_demo')",
          [randomUUID(), extra.tenantId ?? DEMO_TENANT_ID, jobId, session, extra.actor ?? DEMO_MEMBERSHIP_ID]);
      });
      await expect(claim(f.jobId, other)).rejects.toThrow(/duplicate key|PRACTICE_FEED_FORBIDDEN/u);
      await expect(claim(f.jobId, f.sessionId)).rejects.toThrow(/duplicate key/u);
      const g = await fixture();
      await expect(claim(g.jobId, g.sessionId, { environment: "pilot_no_charge" })).rejects.toThrow("PRACTICE_FEED_FORBIDDEN");
      await expect(claim(g.jobId, g.sessionId, { tenantId: otherTenant })).rejects.toThrow(/row-level security|PRACTICE_FEED_FORBIDDEN/u);
      await expect(claim(g.jobId, g.sessionId)).rejects.toThrow("PRACTICE_FEED_AUDIT_REQUIRED"); // no claim audit event in this transaction
      expect(await count("SELECT count(*) n FROM app.practice_feed_job_owner WHERE job_id=$1", [g.jobId])).toBe(0);
      // An account cannot be bound to a session that does not own the job, even with that session's own setting.
      await expect(withTenant(runtime, context, async (db) => {
        await settings(db, other);
        await db.$client.query("INSERT INTO app.practice_feed_account(id,tenant_id,job_id,session_id,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,'synthetic_demo')", [randomUUID(), DEMO_TENANT_ID, f.jobId, other, DEMO_MEMBERSHIP_ID]);
      })).rejects.toThrow("PRACTICE_FEED_FORBIDDEN");
      expect(await count("SELECT count(*) n FROM app.practice_feed_account WHERE job_id=$1", [f.jobId])).toBe(0);
    });
  });

  describe("an advance command cannot commit without its generated movement effects", () => {
    const rawAdvance = (f: { jobId: string; sessionId: string }, accountId: string, revision: number, movementKey: string, step: string, events: Array<{ kind: string; key?: string }>) => withTenant(runtime, context, async (db) => {
      await settings(db, f.sessionId);
      const commandId = randomUUID(), payloadHash = "e".repeat(64);
      await db.$client.query(`INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,movement_key,step,actor_membership_id,payload_hash,environment)
        VALUES($1,$2,$3,$4,$5,'advance',$6,$7,$8,$9,'synthetic_demo')`, [commandId, DEMO_TENANT_ID, f.jobId, accountId, revision, movementKey, step, DEMO_MEMBERSHIP_ID, payloadHash]);
      const defs: Record<string, { state: string; identity: string; representation: string }> = {
        pending: { state: "pending", identity: "identified", representation: "feed" }, settled: { state: "settled", identity: "identified", representation: "feed" },
        statement: { state: "settled", identity: "identified", representation: "statement-line" }, unknown: { state: "possible_duplicate", identity: "unidentified", representation: "unidentified-line" },
      };
      for (const event of events) {
        const key = event.key ?? movementKey, d = defs[event.kind]!, pence = practiceMovementCatalogueV1.find((entry) => entry.movement === key)!.grossPence;
        await db.$client.query(`INSERT INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GBP',$12,'synthetic_demo','practice-feed-event.v1',$13) ON CONFLICT(tenant_id,account_id,event_id) DO NOTHING`,
        [randomUUID(), DEMO_TENANT_ID, f.jobId, accountId, commandId, event.kind, key, `${event.kind}-${key}`, d.identity, d.representation, pence, d.state, hashOf(f, accountId, { kind: event.kind, key, identity: d.identity, representation: d.representation, pence, state: d.state })]);
      }
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${DEMO_MEMBERSHIP_ID}`, eventType: "practice_feed.advance", subjectType: "job", subjectRef: f.jobId,
        payload: { references: { commandId, accountId, sessionId: f.sessionId }, hashes: { command: payloadHash }, classifications: { practiceFeed: "financial" } } }]);
    });
    it("rolls back an audited advance with no events, or with only part of a page overlap, or with the wrong event for its step", async () => {
      const f = await connected(), accountId = f.state.accountId!;
      await expect(rawAdvance(f, accountId, 2, "receipt-384", "settled", [])).rejects.toThrow("PRACTICE_FEED_EFFECT_REQUIRED");
      await expect(rawAdvance(f, accountId, 2, "receipt-384", "page_overlap", [{ kind: "pending" }])).rejects.toThrow("PRACTICE_FEED_EFFECT_REQUIRED");
      await expect(rawAdvance(f, accountId, 2, "receipt-384", "pending", [])).rejects.toThrow("PRACTICE_FEED_EFFECT_REQUIRED");
      await expect(rawAdvance(f, accountId, 2, "receipt-384", "unknown_duplicate", [])).rejects.toThrow(/PRACTICE_FEED_SETTLEMENT_REQUIRED|PRACTICE_FEED_EFFECT_REQUIRED/u);
      expect(await count("SELECT count(*) n FROM app.practice_feed_command WHERE job_id=$1", [f.jobId])).toBe(1);
      expect(await count("SELECT count(*) n FROM app.practice_feed_event WHERE job_id=$1", [f.jobId])).toBe(0);
    });
    it("accepts the complete generated effects (control), and a legitimate replay whose events already exist", async () => {
      const f = await connected(), accountId = f.state.accountId!;
      await rawAdvance(f, accountId, 2, "receipt-384", "page_overlap", [{ kind: "pending" }, { kind: "settled" }]);
      // A replay of the settlement adds no row, because the identity already exists: that is complete, not missing.
      await rawAdvance(f, accountId, 3, "receipt-384", "replay", [{ kind: "settled" }]);
      await rawAdvance(f, accountId, 4, "receipt-384", "replay", []);
      expect(await count("SELECT count(*) n FROM app.practice_feed_event WHERE job_id=$1", [f.jobId])).toBe(2);
      expect(await count("SELECT count(*) n FROM app.practice_feed_command WHERE job_id=$1", [f.jobId])).toBe(4);
    });
  });

  it("the fixed catalogue amounts are table constraints too, independent of the guard trigger", async () => {
    const ctx = await connected(), client = await admin.connect();
    const columns = "(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash)";
    const commandId = (await admin.query("SELECT id FROM app.practice_feed_command WHERE job_id=$1", [ctx.jobId])).rows[0].id;
    const row = (key: string, pence: number, kind = "settled", state = "settled", environment = "synthetic_demo") =>
      [randomUUID(), DEMO_TENANT_ID, ctx.jobId, ctx.state.accountId, commandId, kind, key, `${kind}-${key}`, "identified", "feed", pence, "GBP", state, environment, "practice-feed-event.v1", "a".repeat(64)];
    try {
      await client.query("SET session_replication_role=replica"); // disables triggers, never CHECK constraints
      for (const entry of practiceMovementCatalogueV1) {
        await expect(client.query(`INSERT INTO app.practice_feed_event${columns} VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, row(entry.movement, entry.grossPence + 1)), entry.movement).rejects.toMatchObject({ code: "23514" });
      }
      await expect(client.query(`INSERT INTO app.practice_feed_event${columns} VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, row("receipt-384", 38_400, "pending", "settled"))).rejects.toMatchObject({ code: "23514" });
      await expect(client.query(`INSERT INTO app.practice_feed_event${columns} VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, row("receipt-384", 38_400, "settled", "settled", "production"))).rejects.toMatchObject({ code: "23514" });
      // The control: the exact catalogue row is accepted by the constraints themselves.
      await client.query(`INSERT INTO app.practice_feed_event${columns} VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, row("receipt-384", 38_400));
    } finally { await client.query("SET session_replication_role=origin"); client.release(); }
  });

  it("catalogs enforce FORCE RLS, migration ownership, both policy roles, append-only grants and no SECURITY DEFINER writer", async () => {
    const tables = ["practice_feed_job_owner", "practice_feed_account", "practice_feed_command", "practice_feed_event", "practice_feed_receipt_match"];
    const rows = (await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1)", [tables])).rows;
    expect(rows).toHaveLength(5); expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity && row.owner === "jobguard_migration")).toBe(true);
    const policies = (await admin.query("SELECT roles FROM pg_policies WHERE schemaname='app' AND tablename=ANY($1)", [tables])).rows;
    expect(policies).toHaveLength(5); expect(policies.every((row) => row.roles.includes("jobguard_migration") && row.roles.includes("jobguard_runtime"))).toBe(true);
    const grants = (await admin.query("SELECT table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee='jobguard_runtime' AND table_schema='app' AND table_name=ANY($1) ORDER BY 1,2", [tables])).rows;
    expect(grants).toEqual(tables.flatMap((table) => [{ table_name: table, privilege_type: "INSERT" }, { table_name: table, privilege_type: "SELECT" }]).sort((a, b) => a.table_name.localeCompare(b.table_name) || a.privilege_type.localeCompare(b.privilege_type)));
    for (const table of tables) for (const operation of [`UPDATE app.${table} SET environment='synthetic_demo'`, `DELETE FROM app.${table}`, `TRUNCATE app.${table}`]) {
      await expect(withTenant(runtime, context, (db) => db.$client.query(operation))).rejects.toMatchObject({ code: "42501" });
    }
    const routines = (await admin.query("SELECT proname,prosecdef,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime_exec,pg_get_userbyid(proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND proname IN('guard_practice_feed','require_practice_feed_effect')")).rows;
    expect(routines).toHaveLength(2); expect(routines.every((row) => !row.prosecdef && !row.runtime_exec && row.owner === "jobguard_migration")).toBe(true);
  });
});
