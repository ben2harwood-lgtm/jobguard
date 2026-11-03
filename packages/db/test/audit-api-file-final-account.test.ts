import { fakeAuditAppend } from "./audit-protocol-fixture.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinalAccountApplication } from "../../../apps/api/src/final-account.application.js";
import { ProofApplication } from "../../../apps/api/src/proof/proof.application.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const jobId = randomUUID(), scopeId = randomUUID(), baselineId = randomUUID(), evidenceId = randomUUID();
const command = (expectedRevision?: number) => ({ version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision });
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
type Row = Record<string, any>;

/** Scripted SQL runs the real applications/repositories. It does not prove PostgreSQL locks, RLS or rollback. */
class FinalAccountSql {
  head: Row | undefined;
  revisions: Row[] = [];
  variations: Row[] = [];
  proof: Row[] = [];
  invalidations: Row[] = [];
  authorizations: Array<{ hash: string; revoked: boolean }> = [];
  readonly calls: string[] = [];
  pauseMember?: { entered: ReturnType<typeof deferred>; resume: ReturnType<typeof deferred> };
  pauseVariations?: { entered: ReturnType<typeof deferred>; resume: ReturnType<typeof deferred> };
  waitingAssembler?: ReturnType<typeof deferred>;
  private lockTail = Promise.resolve();
  query = async (sql: string, values: any[] = []) => {
    this.calls.push(sql);
    const rows = (items: Row[]) => ({ rows: items, rowCount: items.length });
    if (sql.includes("authenticate_practice_session")) return rows([{ tenant_id: tenantId, membership_id: jobId, identity_user_id: scopeId }]);
    if (sql.includes("WITH RECURSIVE practice_owned_job")) return rows([{ id: jobId }]);
    if (sql.startsWith("SELECT 1 FROM app.membership")) {
      const pause = this.pauseMember;
      if (pause) { delete this.pauseMember; pause.entered.resolve(); await pause.resume.promise; }
      return rows([{}]);
    }
    if (sql.startsWith("SELECT baseline_quote_version_id")) return rows([{ baseline_quote_version_id: baselineId }]);
    if (sql.startsWith("SELECT l.* FROM app.quote_document_version")) return rows([{ id: baselineId, scope_item_id: scopeId,
      scope_revision_id: scopeId, quote_revision_id: baselineId, description: "Fictional baseline", origin: "human",
      quantity_decimal: "1", unit: "item", unit_rate_pence: 100000, discount_decimal: "0", tax_treatment: "standard_rate_20",
      rate_provenance: { kind: "human_confirmed", sourceRef: null, sourceHash: null, rateVersion: null }, category: null, region: null }]);
    if (sql.startsWith("SELECT r.id source_id,r.scope_item_id")) {
      const snapshot = structuredClone(this.variations), pause = this.pauseVariations;
      if (pause) { delete this.pauseVariations; pause.entered.resolve(); await pause.resume.promise; }
      return rows(snapshot);
    }
    if (sql.startsWith("SELECT e.id evidence_id")) return rows(this.invalidations.length ? [] : this.proof);
    if (sql.includes("FROM app.evidence_invalidation") && sql.startsWith("SELECT")) return rows(this.invalidations);
    if (sql.startsWith("SELECT id FROM app.scope_identity")) return rows([{ id: scopeId }]);
    if (sql.startsWith("SELECT * FROM app.final_account_draft")) return rows(this.head ? [{ ...this.head }] : []);
    if (sql.startsWith("INSERT INTO app.final_account_draft")) { this.head = { id: values[0], revision: 0, current_revision_id: null }; return rows([]); }
    if (sql.startsWith("SELECT id,revision FROM app.final_account_revision")) return rows(this.revisions.filter(r => r.source_hash === values[2]));
    if (sql.startsWith("INSERT INTO app.final_account_revision")) {
      this.revisions.push({ id: values[0], revision: values[4], source_hash: values[6], tax_policy_version: values[8],
        net_pence: values[9], tax_pence: values[10], total_pence: values[11], issue_blocked: values[12], findings: JSON.parse(values[13]),
        lines: [], proof: [] });
      return rows([]);
    }
    if (sql.startsWith("INSERT INTO app.final_account_line")) {
      this.revisions.find(r => r.id === values[3])!.lines.push({ kind: values[4], source_id: values[5], scope_item_id: values[6],
        commercial_revision_id: values[7], approval_id: values[8], description: values[9], net_pence: values[10] }); return rows([]);
    }
    if (sql.startsWith("INSERT INTO app.final_account_proof")) {
      this.revisions.find(r => r.id === values[3])!.proof.push({ evidence_id: values[4], object_version_id: values[5], scope_item_id: values[6],
        evidence_type: values[7], sha256: values[8], mandatory: values[9] }); return rows([]);
    }
    if (sql.startsWith("SELECT app.advance_final_account_draft")) {
      this.head = { ...this.head, current_revision_id: values[2], revision: values[3] }; return rows([]);
    }
    if (sql.startsWith("SELECT app.invalidate_stale_final_account_authorizations")) {
      for (const auth of this.authorizations) if (auth.hash !== values[2]) auth.revoked = true;
      return rows([]);
    }
    if (sql.startsWith("SELECT d.revision,d.current_revision_id")) {
      const revision = this.revisions.find(r => r.id === this.head?.current_revision_id);
      return rows(revision ? [{ ...revision, ...this.head }] : []);
    }
    if (sql.startsWith("SELECT line_kind kind")) return rows(this.revisions.find(r => r.id === values[2])?.lines ?? []);
    if (sql.startsWith("SELECT evidence_id,object_version_id")) return rows(this.revisions.find(r => r.id === values[2])?.proof ?? []);
    if (sql.startsWith("SELECT r.id source_id,r.description")) return rows([]);
    if (sql.startsWith("SELECT id FROM app.evidence_object")) return rows([{ id: evidenceId }]);
    if (sql.startsWith("INSERT INTO app.evidence_invalidation")) { this.invalidations.push({ id: values[0], evidence_id: values[2] }); return rows([{ id: values[0] }]); }
    if (sql.startsWith("SELECT e.job_id,e.scope_item_id")) return rows([]);
    if (sql.includes("FROM app.append_audit(")) return rows(fakeAuditAppend(values[0] as string, tenantId));
    if (sql.includes("AS tenant_id")) return rows([{ tenant_id: tenantId }]);
    if (sql.includes("lock_audit_head")) return rows([]);
    if (sql.includes("clock_timestamp() AS occurred_at")) return rows([{ occurred_at: new Date() }]);
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config|SELECT pg_advisory_xact_lock|INSERT INTO app.audit_event|INSERT INTO app.stage_review_event|SELECT app.advance_audit_head)/u.test(sql)) return rows([]);
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  pool(): Pool {
    return { query: this.query, connect: async () => {
      let unlock: (() => void) | undefined;
      return { release() {}, query: async (sql: string, values: any[] = []) => {
        if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
          expect(values).toEqual([`final-account:${tenantId}:${jobId}`]);
          const previous = this.lockTail, next = deferred();
          this.lockTail = next.promise;
          this.waitingAssembler?.resolve();
          await previous;
          unlock = next.resolve;
        }
        try { return await this.query(sql, values); }
        finally { if (sql === "COMMIT" || sql === "ROLLBACK") { unlock?.(); unlock = undefined; } }
      } };
    } } as unknown as Pool;
  }
  approveExtra(pence: number) {
    const id = randomUUID();
    this.variations.push({ source_id: id, scope_item_id: scopeId, commercial_revision_id: id, description: "Fictional extra", signed_delta_pence: pence, approval_id: randomUUID() });
  }
  completeVerifiedProof() {
    this.proof = [{ evidence_id: evidenceId, object_version_id: "synthetic-proof-v1", scope_item_id: scopeId,
      evidence_type: "electrical_certificate", sha256: "a".repeat(64), mandatory: true }];
  }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("night audit final-account regressions (scripted SQL)", () => {
  it("stale concurrent assembly cannot replace newer approved totals", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const sql = new FinalAccountSql(), app = new FinalAccountApplication(sql.pool(), jobId);
    await app.build(jobId, command(0));
    sql.approveExtra(10000);
    // A passed the old application precheck, but has not read its sources yet.
    const pause = { entered: deferred(), resume: deferred() };
    sql.pauseMember = pause;
    const a = app.build(jobId, command(1));
    await pause.entered.promise;
    sql.approveExtra(20000);
    const b = await app.build(jobId, command(1));
    expect(b.account).toMatchObject({ revision: 2, totals: { net: { pence: 130000 } } });
    pause.resume.resolve();
    await expect(a).rejects.toThrow("STALE_FINAL_ACCOUNT_REVISION");
    expect((await app.get(jobId)).account).toMatchObject({ id: b.account!.id, revision: 2, totals: { net: { pence: 130000 } } });
    expect(sql.revisions).toHaveLength(2);
  });

  it("proof invalidation restores the persisted final-account gate", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const sql = new FinalAccountSql(), app = new FinalAccountApplication(sql.pool(), jobId);
    const initial = await app.build(jobId, command(0));
    expect(initial.account).toMatchObject({ issueBlocked: true, proof: [] });
    // Infrastructure fixture: finalized verified completion, not simulated proof-command validation.
    sql.completeVerifiedProof();
    const proven = await app.build(jobId, command(1));
    expect(proven.account).toMatchObject({ revision: 2, issueBlocked: false, proof: [{ evidenceId }] });
    sql.authorizations.push({ hash: proven.account!.sourceHash, revoked: false });
    const proof = new ProofApplication(sql.pool(), jobId);
    vi.spyOn(proof, "get").mockResolvedValue({} as never);
    await proof.command(jobId, { version: "practice-proof-command.v1", action: "invalidate", commandId: randomUUID(), evidenceId, reasonCode: "verification_invalid" });
    const rebuilt = await app.build(jobId, command(2));
    expect(rebuilt.account).toMatchObject({ revision: 3, issueBlocked: true, proof: [] });
    expect((await app.get(jobId)).account).toEqual(rebuilt.account);
    expect(sql.authorizations[0]!.revoked).toBe(true);
    const repeated = await app.build(jobId, command(3));
    expect(repeated.account).toEqual(rebuilt.account);
    expect(sql.revisions).toHaveLength(3);
    expect(sql.revisions[1]).toMatchObject({ issue_blocked: false, proof: [{ evidence_id: evidenceId }] });
  });

  it("an assembler waiting behind a source snapshot must recheck the draft head", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const sql = new FinalAccountSql(), app = new FinalAccountApplication(sql.pool(), jobId);
    await app.build(jobId, command(0));
    sql.approveExtra(10000);
    const pause = { entered: deferred(), resume: deferred() };
    sql.pauseVariations = pause;
    const a = app.build(jobId, command(1));
    await pause.entered.promise;
    sql.approveExtra(20000);
    sql.waitingAssembler = deferred();
    const b = app.build(jobId, command(1));
    await sql.waitingAssembler.promise;
    pause.resume.resolve();
    expect((await a).account).toMatchObject({ revision: 2, totals: { net: { pence: 110000 } } });
    await expect(b).rejects.toThrow("STALE_FINAL_ACCOUNT_REVISION");
    const retry = await app.build(jobId, command(2));
    expect(retry.account).toMatchObject({ revision: 3, totals: { net: { pence: 130000 }, tax: { pence: 26000 }, total: { pence: 156000 } } });
    expect((await app.get(jobId)).account).toEqual(retry.account);
  });
});
