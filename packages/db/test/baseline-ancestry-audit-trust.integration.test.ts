// Synthetic PostgreSQL regression coverage; no live providers or customer data.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS } from "../src/migrate.js";
import { actor, member, tenant, importIntegrityJob, createIntegrityFixture, seedIntegrityJob, reviewFor, transaction, type IntegrityFixture } from "./commercial-integrity-v3-fixtures.js";

const trustedBinding = (child: string, parent: string) =>
 ` AND (EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=${child}.id AND iv.source_job_id=${parent}.id) OR EXISTS(SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded' AND rv.semantic_key='import:'||${child}.id::text AND rv.result->>'jobId'=${child}.id::text AND rv.result->>'sourceJobId'=${parent}.id::text))`;
const binding = trustedBinding("child", "parent");
const bindings = [binding, binding, trustedBinding("x", "source"), trustedBinding("next_job", "source")];
const migration = MIGRATION_URLS.find(u => u.pathname.endsWith("_baseline_ancestry_audit_trust.sql"))!;
const sql = readFileSync(migration, "utf8");
const names = ["ch6_integrity_authority", "ch6_integrity_sources", "ch6_record_integrity_review", "decision_check_command"];

it("copies every latest authority consumer with only the trusted import-record or receipt binding added", () => {
  for (const [index, name] of names.entries()) {
    const pattern = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION app\\.${name}\\([\\s\\S]*?\\$\\$;`, "g");
    const previous = MIGRATION_URLS.filter(u => u.pathname < migration.pathname)
      .flatMap(u => [...readFileSync(u, "utf8").matchAll(pattern)].map(m => m[0])).at(-1)!;
    const replacement = [...sql.matchAll(pattern)][0]![0];
    expect(replacement.split(bindings[index]!)).toHaveLength(2);
    expect(replacement.replace(bindings[index]!, "")).toBe(previous.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"));
  }
});

describe("trusted imported-baseline ancestry (real PostgreSQL)", () => {
  let f: IntegrityFixture;
  beforeAll(async () => { f = await createIntegrityFixture(); }, 300_000);
  afterAll(async () => { await f?.close(); });

  async function family() {
    const root = await seedIntegrityJob(f), child = randomUUID();
    await transaction(f.admin, async db => {
      // Owner-only synthetic orphan fixture: the missing attestation is the
      // adversarial condition. Constraints remain enabled; only setup triggers
      // are bypassed, as in the existing CH-6 projection fixtures.
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("INSERT INTO app.job(id,tenant_id,title,provenance) VALUES($1,$2,'Fictional imported orphan','imported')", [child, tenant]);
      await db.query("SET LOCAL session_replication_role='origin'");
    });
    return { root: root.job, child };
  }
  async function attest(root: string, child: string) {
    const event = { id: randomUUID(), version: "audit.v1", actorRef: `membership:${member}`, eventType: "job.imported_baseline_attested", subjectType: "job", subjectRef: child,
      payload: { references: { sourceJobId: root } } };
    const result = await transaction(f.runtime, db => db.query("SELECT * FROM app.append_audit($1)", [JSON.stringify([event])]));
    expect(result.rows[0].payload.references.auditTrust).toBe("lower_trust");
  }
  async function adopted(root: string) {
    const child = await importIntegrityJob(f, root);
    const events = await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='job.imported_baseline_attested'", [tenant, child]);
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].payload.references.auditTrust).toBe("lower_trust");
    return child;
  }
  async function decision(child: string) {
    const db = await f.runtime.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      return await db.query("SELECT app.decision_check_command($1,$2,'begin') result", [f.auth.digest,
        JSON.stringify({ version: "finding-evaluation-command.v1", commandId: randomUUID(), tenantId: tenant, jobId: child })]);
    } finally { await db.query("ROLLBACK"); db.release(); }
  }
  async function sourceAncestry(child: string) {
    return transaction(f.admin, async db => {
      const body = (await db.query("SELECT prosrc FROM pg_proc WHERE oid='app.ch6_integrity_sources(uuid,uuid,text)'::regprocedure")).rows[0].prosrc as string;
      const start = body.indexOf("WITH RECURSIVE candidates AS (");
      const end = body.indexOf("SELECT coalesce(jsonb_agg", start);
      expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
      // Exercise the stored routine's exact ownership CTE independently of its
      // family gate. Imported jobs cannot themselves have accepted app quotes;
      // the walk is defense in depth for future eligible candidate shapes.
      await db.query(`CREATE OR REPLACE FUNCTION pg_temp.source_ancestry(t uuid,j uuid,d text) RETURNS uuid[]
        LANGUAGE plpgsql AS $walk$ DECLARE answer uuid[]; BEGIN
        ${body.slice(start, end)} SELECT array_agg(id) INTO answer FROM owned;
        RETURN coalesce(answer,ARRAY[]::uuid[]); END $walk$`);
      return (await db.query("SELECT pg_temp.source_ancestry($1,$2,$3) ids", [tenant, child, f.auth.digest])).rows[0].ids as string[];
    });
  }
  it("refuses forged ancestry with NOT_FOUND, and accepts a real lower-trust import in both authority and decision routines", async () => {
    const { root, child: orphan } = await family();
    let child = orphan;
    await attest(root, child);
    const authority = () => transaction(f.admin, db => db.query("SELECT app.ch6_integrity_authority($1,$2,$3) actor", [tenant, child, f.auth.digest]));
    await expect(authority()).rejects.toMatchObject({ code: "42501", message: "NOT_FOUND" });
    await expect(decision(child)).rejects.toMatchObject({ code: "42501", message: "NOT_FOUND" });
    await expect(transaction(f.runtime, db => db.query("SELECT app.ch6_integrity_sources($1,$2,$3)", [tenant, child, f.auth.digest])))
      .rejects.toMatchObject({ code: "42501", message: "NOT_FOUND" });
    await expect(transaction(f.runtime, db => db.query("SELECT app.ch6_record_integrity_review($1,$2,$3,$4,$5)", [tenant, child, f.auth.digest, "{}", "{}"])))
      .rejects.toMatchObject({ code: "42501", message: "NOT_FOUND" });
    child = await adopted(root);
    expect((await authority()).rows[0].actor).toBe(member);
    expect((await decision(child)).rows[0].result).toEqual({ replay: false });
    // Ownership now succeeds; the unchanged family policy still refuses CH-6
    // v3 processing of an imported job itself.
    await expect(transaction(f.runtime, db => db.query("SELECT app.ch6_integrity_sources($1,$2,$3)", [tenant, child, f.auth.digest])))
      .rejects.toThrow("INTEGRITY_FAMILY_UNAVAILABLE");
    await expect(transaction(f.runtime, db => db.query("SELECT app.ch6_record_integrity_review($1,$2,$3,$4,$5)", [tenant, child, f.auth.digest, "{}", "{}"])))
      .rejects.toThrow("INTEGRITY_FAMILY_UNAVAILABLE");
  });
  it("the stored source-candidate walk filters forged ancestry and retains a real import", async () => {
    const { root, child } = await family();
    await attest(root, child);
    expect(await sourceAncestry(child)).not.toContain(child);
    const imported = await adopted(root);
    expect(await sourceAncestry(imported)).toContain(imported);
  });
  it("refuses a forged parent even when the child has a real import record", async () => {
    const root = await seedIntegrityJob(f, false);
    const foreignRoot = await seedIntegrityJob({ ...f, auth: f.other }, false);
    const child = await adopted(root.job);
    await attest(foreignRoot.job, child);
    await expect(transaction(f.admin, db => db.query("SELECT app.ch6_integrity_authority($1,$2,$3)", [tenant, child, f.other.digest])))
      .rejects.toMatchObject({ code: "42501", message: "NOT_FOUND" });
    expect((await transaction(f.admin, db => db.query("SELECT app.ch6_integrity_authority($1,$2,$3) actor", [tenant, child, f.auth.digest]))).rows[0].actor).toBe(member);
  });
  it("review locks only adopted descendants, preserving the existing review result", async () => {
    const { root, child } = await family();
    await attest(root, child);
    async function reviewLocks(child: string, imported: boolean) {
      const view = await f.repo.read(f.auth.context, actor, f.auth.digest, root);
      const body = await reviewFor(f, root);
      const finding = view.result.findings.find(x => x.key === body.findingKey)!;
      const reviewer = await f.runtime.connect();
      try {
        await reviewer.query("BEGIN");
        await reviewer.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
        const result = await reviewer.query("SELECT app.ch6_record_integrity_review($1,$2,$3,$4,$5) result", [tenant, root, f.auth.digest, JSON.stringify(body), JSON.stringify(finding.sourceSnapshot)]);
        expect(result.rows[0].result.commandId).toBe(body.commandId);
        const competing = () => transaction(f.admin, db => db.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE NOWAIT", [tenant, child]));
        if (imported) await expect(competing()).rejects.toMatchObject({ code: "55P03" });
        else expect((await competing()).rowCount).toBe(1);
      } finally { await reviewer.query("ROLLBACK"); reviewer.release(); }
    }
    await reviewLocks(child, false);
    await reviewLocks(await adopted(root), true);
  });
  it("kills a scratch mutation removing one authority predicate, then restores it by rollback", async () => {
    const { root, child } = await family();
    await attest(root, child);
    const db = await f.admin.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      const definition = (await db.query("SELECT pg_get_functiondef('app.ch6_integrity_authority(uuid,uuid,text)'::regprocedure) body")).rows[0].body as string;
      expect(definition).toContain(binding);
      await db.query(definition.replace(binding, ""));
      // This is the exact rejection assertion above with the guard removed:
      // it must fail because the forged event now authorizes the child.
      const granted = await db.query("SELECT app.ch6_integrity_authority($1,$2,$3) actor", [tenant, child, f.auth.digest]);
      expect(granted.rows[0].actor).toBe(member);
      await expect(expect(Promise.resolve(granted))
        .rejects.toMatchObject({ code: "42501", message: "NOT_FOUND" })).rejects.toThrow();
    } finally { await db.query("ROLLBACK"); db.release(); }
    await expect(transaction(f.admin, db => db.query("SELECT app.ch6_integrity_authority($1,$2,$3)", [tenant, child, f.auth.digest])))
      .rejects.toMatchObject({ code: "42501", message: "NOT_FOUND" });
  });
});
