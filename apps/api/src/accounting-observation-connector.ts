import { createHash } from "node:crypto";
import { z } from "zod";
import type { AccountingObservationReceiptRepository, VerifiedTenantContext } from "@jobguard/db";
import { observationV1, parseObservation, type Observation } from "@jobguard/core";

const scopeV1 = z.object({ tenantId: z.guid(), jobId: z.guid() }).strict();
const fixtureV1 = z.object({
  version: z.literal("fake-accounting-observations.v1"),
  environment: z.literal("synthetic_demo"),
  observations: z.array(observationV1).max(100),
}).strict();

export class AccountingConnectorError extends Error {
  constructor(readonly code: "ACCOUNTING_CONNECTOR_DISABLED" | "INVALID_ACCOUNTING_FIXTURE" | "ACCOUNTING_BINDING_MISMATCH" | "ACCOUNTING_VERSION_CONFLICT") {
    super(code);
    this.name = "AccountingConnectorError";
  }
}

/** No approved G1/D04/D12 route exists. Request flags or purported approvals cannot enable it. */
export function readAccountingConnector(_request: unknown): never {
  throw new AccountingConnectorError("ACCOUNTING_CONNECTOR_DISABLED");
}

/**
 * Explicit process-local fictional documents only; no I/O, storage, detection or sink.
 * Output is the existing SV-7A observation contract, suitable for worker fixture sources.
 * Hashes cover the exact UTF-8 text. Caller-supplied fixture times are not live verification.
 */
export function parseFakeAccountingObservations(rawScope: unknown, raw: unknown): readonly Observation[] {
  const scope = scopeV1.safeParse(rawScope), fixture = fixtureV1.safeParse(raw);
  if (!scope.success || !fixture.success) throw new AccountingConnectorError("INVALID_ACCOUNTING_FIXTURE");
  const versions = new Map<string, Observation>();
  for (const value of fixture.data.observations) {
    if (value.tenantId !== scope.data.tenantId || value.jobId !== scope.data.jobId)
      throw new AccountingConnectorError("ACCOUNTING_BINDING_MISMATCH");
    if (value.kind !== "supplier_line" || createHash("sha256").update(value.text, "utf8").digest("hex") !== value.evidence.sha256)
      throw new AccountingConnectorError("INVALID_ACCOUNTING_FIXTURE");
    const observation = parseObservation(value);
    const key = JSON.stringify([observation.evidence.id, observation.evidence.objectVersionId]);
    const prior = versions.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(observation))
      throw new AccountingConnectorError("ACCOUNTING_VERSION_CONFLICT");
    versions.set(key, observation);
  }
  return Object.freeze([...versions.values()]);
}

/** Explicit synthetic worker seam; receipts survive new instances and process restarts. */
export class FakeAccountingObservationEmitter {
  constructor(private readonly receipts: AccountingObservationReceiptRepository) {}

  async emit(context: VerifiedTenantContext, rawScope: unknown, raw: unknown): Promise<readonly Observation[]> {
    const observations = parseFakeAccountingObservations(rawScope, raw);
    const scope = scopeV1.parse(rawScope);
    if (context.tenantId !== scope.tenantId) throw new AccountingConnectorError("ACCOUNTING_BINDING_MISMATCH");
    return this.receipts.claim(context, observations);
  }
}
