import { EvidencePackV3DependencyError } from "./evidence-pack-v3-ports.js";

/**
 * The checked SQL writer and authentic eight-section binding are absent. There
 * is deliberately no INSERT fallback into the legacy runtime-writable tables.
 * Even a successful source preparation cannot mint a v3 artifact or approval.
 */
export function requireEvidencePackV3Writer(): never {
  throw new EvidencePackV3DependencyError("HOLD-EP-CHECKED-WRITER");
}
