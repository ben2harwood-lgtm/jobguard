import type { Pool } from "pg";
import { z } from "zod";
import { sha256 } from "@jobguard/core";
import { loadEvidencePackSources, type EvidencePackSources } from "./evidence-pack-sources.js";
import { authenticatePracticeSession, practiceOwnedJobsSql, PracticeAccessError } from "./practice-session.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import {
  heldEvidencePackV3Ports, createEvidencePackV3SourcePorts, EvidencePackV3DependencyError, EvidencePackV3SourceConflict,
  type EvidencePackV3Scope, type EvidencePackV3SourcePorts,
} from "./evidence-pack-v3-ports.js";

const uuid = z.string().uuid().transform(value => value.toLowerCase());
// A binding is valid only for its issuing transaction; a copied object is not authority.
const bindings = new WeakMap<object, TenantTransaction>();
export type EvidencePackV3VerifiedBinding = Readonly<{
  tenantId: string; caseId: string; jobId: string; locked: boolean;
}>;

/** Must be called inside a fresh repeatable-read transaction, before source reads. */
export async function verifyEvidencePackV3Case(
  tx: TenantTransaction, tenantId: string, caseId: string, sessionDigest: string,
): Promise<EvidencePackV3VerifiedBinding> {
  tenantId = uuid.parse(tenantId); caseId = uuid.parse(caseId);
  if (!/^[a-f0-9]{64}$/u.test(sessionDigest)) throw new PracticeAccessError("UNAUTHENTICATED");
  // Reauthenticate now, including after the external handoff. Do not rely on a
  // prior PracticeAccess result or a previously valid session/membership.
  const principal = (await tx.$client.query<{ tenant_id: string; membership_id: string }>(
    "SELECT * FROM app.authenticate_practice_session($1,$2) WHERE current_database()='jobguard_synthetic_demo'", [sessionDigest, tenantId],
  )).rows[0];
  if (!principal || uuid.parse(principal.tenant_id) !== tenantId) throw new PracticeAccessError("UNAUTHENTICATED");
  const row = (await tx.$client.query<{ job_id: string; locked: boolean }>(practiceOwnedJobsSql() + `
    SELECT c.job_id, EXISTS(SELECT 1 FROM app.final_account_lock l
      WHERE l.tenant_id=c.tenant_id AND l.job_id=c.job_id) locked
    FROM practice_owned_job j
    JOIN app.recovery_case c ON c.tenant_id=$1 AND c.job_id=j.id
    JOIN app.membership m ON m.tenant_id=c.tenant_id AND m.id=$4
    WHERE c.id=$2 AND m.role='owner' AND m.revoked_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())`,
  [tenantId, caseId, sessionDigest, uuid.parse(principal.membership_id)])).rows[0];
  if (!row) throw new PracticeAccessError("NOT_FOUND");
  await tx.$client.query("SELECT set_config('app.practice_material_digest',$1,true)", [sessionDigest]);
  const binding = Object.freeze({ tenantId, caseId, jobId: uuid.parse(row.job_id), locked: row.locked });
  bindings.set(binding, tx);
  return binding;
}

// Code-unit ordering; do not round timestamps, normalize bytes or rewrite source IDs.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
export type EvidencePackV3OrdinarySources = EvidencePackSources & {
  scope: EvidencePackV3Scope; lifecycle: "pre_lock";
  producerBindings: "held"; complete: false;
};

/** Set snapshot mode on BEGIN, before withTenant's transaction-local RLS query. */
export function withEvidencePackV3Snapshot<T>(
  pool: Pool, context: VerifiedTenantContext, work: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  const snapshotPool = new Proxy(pool, { get(target, key) {
    if (key === "connect") return async () => {
      const client = await target.connect();
      return new Proxy(client, { get(connection, property) {
        if (property === "query") return (sql: string, values?: unknown[]) =>
          connection.query(sql === "BEGIN" ? "BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY" : sql, values);
        const value = Reflect.get(connection, property);
        return typeof value === "function" ? value.bind(connection) : value;
      } });
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return withTenant(snapshotPool, context, work);
}

/**
 * Reads only existing ordinary sources. It cannot query hidden relations, run
 * detection, manufacture a catch case or reinterpret CH8-A specimens as facts.
 * Lock state and ordinary rows are read in the same MVCC snapshot by the caller.
 */
export async function loadEvidencePackV3Sources(
  tx: TenantTransaction, binding: EvidencePackV3VerifiedBinding,
  ports: EvidencePackV3SourcePorts = heldEvidencePackV3Ports,
): Promise<EvidencePackV3OrdinarySources> {
  if (bindings.get(binding) !== tx) throw new PracticeAccessError("NOT_FOUND");
  const { tenantId, jobId, caseId } = binding;
  if (binding.locked) {
    await ports.lockReveal.requirePublishedBinding({
      tenantId, jobId, caseId, visibleSourceRevision: "unbound",
    });
    // Accepted lock/reveal projections cannot authorize unbound CH8-A sections.
    throw new EvidencePackV3DependencyError("HOLD-EP-SECTIONS");
  }
  const ordinary = await loadEvidencePackSources(tx, tenantId, caseId);
  if (uuid.parse(ordinary.jobId) !== jobId || ordinary.sources.some(source => uuid.parse(source.jobId) !== jobId)) {
    throw new PracticeAccessError("NOT_FOUND");
  }
  // Source content includes exact original bytes/metadata from the accepted v1
  // reader. No request ID, generation clock, hidden count or polling state enters it.
  const visibleSourceRevision = sha256(canonical({ tenantId, caseId, ...ordinary }));
  return { ...ordinary, scope: { tenantId, jobId, caseId, visibleSourceRevision },
    lifecycle: "pre_lock", producerBindings: "held", complete: false };
}

/** Source preparation only. No export, pack row, approval, audit or send is written. */
export async function prepareEvidencePackV3Sources(
  pool: Pool, sessionId: string | undefined, caseId: string, requestId: string,
  ports?: EvidencePackV3SourcePorts,
): Promise<EvidencePackV3OrdinarySources> {
  // Authenticate before parsing the requested subject/command to avoid an oracle.
  const auth = await authenticatePracticeSession(pool, sessionId);
  caseId = uuid.parse(caseId); requestId = uuid.parse(requestId);
  ports ??= createEvidencePackV3SourcePorts(pool, auth.context, auth.digest);
  const activePorts = ports;
  const snapshot = async () => {
    const result = await withEvidencePackV3Snapshot(pool, auth.context, async tx => {
      const binding = await verifyEvidencePackV3Case(tx, auth.context.tenantId, caseId, auth.digest);
      if (binding.locked) return binding;
      return loadEvidencePackV3Sources(tx, binding, activePorts);
    });
    if ("locked" in result) {
      // Producer APIs own their transactions. Do not hold a source transaction
      // (or its pool connection) while invoking them. No content is read pre-lock.
      await activePorts.lockReveal.requirePublishedBinding({
        tenantId: result.tenantId, jobId: result.jobId, caseId: result.caseId, visibleSourceRevision: "unbound",
      });
      throw new EvidencePackV3DependencyError("HOLD-EP-SECTIONS");
    }
    return result;
  };
  const before = await snapshot();
  const requestRef = await ports.mustSurface.requestCheck(before.scope, requestId);
  if (typeof requestRef !== "string" || !requestRef.length || requestRef.length > 4096) throw new EvidencePackV3SourceConflict();
  await ports.mustSurface.readCompletion(before.scope, requestRef);
  const after = await snapshot();
  if (before.scope.visibleSourceRevision !== after.scope.visibleSourceRevision) throw new EvidencePackV3SourceConflict();
  return after;
}
