import {
  EnterpriseFeeError, enterpriseFeePreparedReferenceV1, enterpriseFeeReferenceInputV1,
  enterpriseFeeReferenceBindingRequestV1, enterpriseFeeReferenceBindingV1,
  parseEnterpriseFee, representEnterpriseFeeReference, type EnterpriseFeePreparedReference,
} from "@jobguard/core";
import { canonicalJson, sha256Hex } from "@jobguard/db";

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
/** Internal reference preparation only. This is not composed into a route, repository writer or command dispatcher. */
export function prepareEnterpriseFeeReference(raw: unknown): EnterpriseFeePreparedReference {
  const manifest = parseEnterpriseFee(enterpriseFeeReferenceInputV1, raw);
  const inputFactsHash = sha256Hex(canonicalJson(manifest));
  const artifact = representEnterpriseFeeReference(manifest, inputFactsHash);
  const statementHash = sha256Hex(canonicalJson(artifact));
  return freeze(parseEnterpriseFee(enterpriseFeePreparedReferenceV1, {
    version: "enterprise-fee-prepared-reference.v1", manifest, artifact, inputFactsHash, statementHash,
  }));
}
/** Recompute rather than trust a candidate hash, amount or trace. This does not authenticate the supplied source facts. */
export function validateEnterpriseFeeReference(raw: unknown): EnterpriseFeePreparedReference {
  const candidate = parseEnterpriseFee(enterpriseFeePreparedReferenceV1, raw), prepared = prepareEnterpriseFeeReference(candidate.manifest);
  if (candidate.inputFactsHash !== prepared.inputFactsHash || candidate.statementHash !== prepared.statementHash ||
    canonicalJson(candidate.artifact) !== canonicalJson(prepared.artifact)) throw new EnterpriseFeeError("STALE_FACTS");
  return prepared;
}
/** Construct exact immutable binding DATA; no Decision, authorization, approval or command receipt is written. */
export function bindEnterpriseFeeReference(raw: unknown, rawBinding: unknown) {
  const prepared = validateEnterpriseFeeReference(raw), request = parseEnterpriseFee(enterpriseFeeReferenceBindingRequestV1, rawBinding);
  const { artifact: a, manifest } = prepared;
  const artifact = {
    version: "enterprise-fee-signed-artifact.v1", action: request.action, tenantId: a.tenantId, statementId: a.statementId,
    revisionId: request.revisionId, statementHash: prepared.statementHash, inputFactsHash: prepared.inputFactsHash,
    totalPence: a.totalPence, currency: a.currency, expiresAt: request.expiresAt,
    sections: a.sections.map(s => {
      const agreement = manifest.statement.agreements.find(v => v.id === s.agreementVersionId);
      if (!agreement) throw new EnterpriseFeeError("STALE_FACTS");
      return { agreementVersionId: s.agreementVersionId, agreementHash: agreement.hash, feePence: s.deltaPence };
    }),
  };
  return freeze(parseEnterpriseFee(enterpriseFeeReferenceBindingV1, { artifact, artifactHash: sha256Hex(canonicalJson(artifact)) }));
}
