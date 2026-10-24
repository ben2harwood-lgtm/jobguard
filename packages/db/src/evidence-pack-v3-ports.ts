import type { TenantTransaction } from "./tenant-context.js";

export type EvidencePackV3Hold = "HOLD-EP-MUST-SURFACE" | "HOLD-EP-SV5-BINDING" | "HOLD-EP-CHECKED-WRITER";
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

/**
 * SV-5 is deliberately unbound. There is no accepted eight-section payload schema
 * to return. Promise<never> prevents a speculative adapter from creating a pack.
 * Replace this port only with the accepted immutable producer contract and tests.
 */
export interface EvidencePackLockRevealPort {
  requirePublishedBinding(tx: TenantTransaction, scope: EvidencePackV3Scope): Promise<never>;
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
