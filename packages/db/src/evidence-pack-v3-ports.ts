import { FinalAccountLockRepository, type PersistedFinalAccountLock } from "./final-account-lock-repository.js";
import { FinalCheckRepository, type FinalCheckView } from "./final-check-repository.js";
import type { Pool } from "pg";
import type { VerifiedTenantContext } from "./tenant-context.js";

export type EvidencePackV3Hold = "HOLD-EP-MUST-SURFACE" | "HOLD-EP-SV5-BINDING" | "HOLD-EP-CHECKED-WRITER" | "HOLD-EP-SECTIONS";
export class EvidencePackV3DependencyError extends Error {
  readonly code = "EVIDENCE_PACK_V3_DEPENDENCY_HELD";
  constructor(readonly hold: EvidencePackV3Hold) {
    // Same public failure in every hidden world. The hold is internal only.
    super("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
  }
}
export class EvidencePackV3SourceConflict extends Error {
  readonly code = "EVIDENCE_PACK_V3_SOURCE_CONFLICT";
  constructor() { super("EVIDENCE_PACK_V3_SOURCE_CONFLICT"); }
}

/** Server-derived case identity and visible-source digest, never browser authority. */
export type EvidencePackV3Scope = Readonly<{
  tenantId: string; jobId: string; caseId: string; visibleSourceRevision: string;
}>;

/**
 * Consumer seam only: no accepted producer exists at this base. No signal metadata
 * or caller-supplied completion flag crosses this interface. A producer adapter
 * must authenticate the opaque receipt and bind it to the exact visible revision.
 * Methods run OUTSIDE the source transaction; authority is rechecked afterwards.
 */
export interface EvidencePackMustSurfaceCheckPort {
  requestCheck(scope: EvidencePackV3Scope, requestId: string): Promise<string>;
  readCompletion(scope: EvidencePackV3Scope, requestRef: string): Promise<void>;
}

/** Accepted SV-5 projections; these are not an eight-section export schema. */
export type EvidencePackLockRevealBinding = Readonly<{
  lock: PersistedFinalAccountLock;
  reveal: FinalCheckView;
}>;
export interface EvidencePackLockRevealPort {
  requirePublishedBinding(scope: EvidencePackV3Scope): Promise<EvidencePackLockRevealBinding>;
}

/** Only public, runtime-role services. No worker manifest or shadow credential. */
export function bindEvidencePackV3LockReveal(
  context: VerifiedTenantContext, sessionDigest: string,
  locks: Pick<FinalAccountLockRepository, "read" | "verify">,
  checks: Pick<FinalCheckRepository, "read">,
): EvidencePackLockRevealPort {
  const port: EvidencePackLockRevealPort = {
    async requirePublishedBinding(scope: EvidencePackV3Scope) {
      if (scope.tenantId !== context.tenantId) throw new EvidencePackV3SourceConflict();
      const view = await locks.read(context, scope.jobId);
      // Do not even invoke the reveal service before an immutable lock exists.
      if (!view.lock) throw new EvidencePackV3DependencyError("HOLD-EP-SV5-BINDING");
      if (view.lock.tenantId !== scope.tenantId || view.lock.jobId !== scope.jobId) throw new EvidencePackV3SourceConflict();
      const verification = await locks.verify(context, scope.jobId);
      if (!verification.verified) throw new EvidencePackV3SourceConflict();
      // This controlled read reauthenticates the actual session and ownership.
      const reveal = await checks.read(context, scope.jobId, sessionDigest);
      if (reveal.state !== "completed") throw new EvidencePackV3DependencyError("HOLD-EP-SV5-BINDING");
      if (reveal.lockId !== view.lock.id || !reveal.runId) throw new EvidencePackV3SourceConflict();
      return Object.freeze({ lock: view.lock, reveal });
    },
  };
  Object.freeze(port);
  return port;
}

export function createEvidencePackV3SourcePorts(
  pool: Pool, context: VerifiedTenantContext, sessionDigest: string,
): EvidencePackV3SourcePorts {
  return Object.freeze({ mustSurface: heldEvidencePackV3Ports.mustSurface,
    lockReveal: bindEvidencePackV3LockReveal(context, sessionDigest,
      new FinalAccountLockRepository(pool), new FinalCheckRepository(pool)) });
}
export type EvidencePackV3SourcePorts = Readonly<{
  mustSurface: EvidencePackMustSurfaceCheckPort;
  lockReveal: EvidencePackLockRevealPort;
}>;

export const heldEvidencePackV3Ports: EvidencePackV3SourcePorts = Object.freeze({
  mustSurface: Object.freeze({
    async requestCheck() { throw new EvidencePackV3DependencyError("HOLD-EP-MUST-SURFACE"); },
    async readCompletion() { throw new EvidencePackV3DependencyError("HOLD-EP-MUST-SURFACE"); },
  }),
  lockReveal: Object.freeze({
    async requirePublishedBinding() { throw new EvidencePackV3DependencyError("HOLD-EP-SV5-BINDING"); },
  }),
});
