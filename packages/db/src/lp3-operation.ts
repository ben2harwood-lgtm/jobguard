import { createHash } from "node:crypto";
import { z } from "zod";

// This isolated contract is not yet connected to the dispatcher or SQL routines.
// See the LP-3 receipt for the protected prerequisites blocking that cutover.
const uuid = z.string().uuid().regex(/^[0-9a-f-]+$/u);
const hash = z.string().regex(/^[0-9a-f]{64}$/u);
const integer = z.number().int().min(0).max(2_147_483_647).refine(value => !Object.is(value, -0));
const pence = z.number().int().min(0).max(1_000_000_000_000).refine(value => !Object.is(value, -0));
// PostgreSQL UTF-8 text cannot represent NUL or unpaired UTF-16 surrogates.
const text = (maximum: number) => z.string().min(1).max(maximum)
  .refine(value => !/[\u0000\uD800-\uDFFF]/u.test(value), "invalid PostgreSQL text");
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  .refine(value => !value.startsWith("0000-") && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
    "expected a valid UTC timestamp with exact millisecond precision");
const common = {
  version: z.literal("lp3-input.v1"), tenantId: uuid, actorMembershipId: uuid, jobId: uuid,
};
const document = {
  documentId: uuid, documentVersion: integer.refine(value => value > 0), documentHash: hash,
  expectedJobRevision: integer,
};
const disposition = {
  ...common, ...document, occurredAt: timestamp, amountPence: z.null(), currency: z.null(),
  recipient: z.null(), policyVersion: z.literal("quote-disposition.v1"),
};

/** Validated facts only. Server-generated result IDs never participate in this envelope. */
export const lp3OperationV1Schema = z.discriminatedUnion("operation", [
  z.object({ ...common, operation: z.literal("job.switch_live"), acceptedDocumentId: uuid,
    acceptedDocumentVersion: integer.refine(value => value > 0), acceptedDocumentHash: hash,
    expectedJobRevision: integer, acceptedNetValuePence: pence, recoveryCapPence: pence,
    mode: z.enum(["pilot_no_charge", "synthetic_demo"]),
    activationTermsVersion: z.enum(["pilot_no_charge.v1", "synthetic_demo_illustrative.v1"]),
    feePolicyVersion: z.literal("reference_fee_policy_v1"), amountPence: z.literal(7900).nullable(),
    currency: z.literal("GBP").nullable(), recipient: z.null(), activatedAt: timestamp,
  }).strict(),
  z.object({ ...common, operation: z.literal("synthetic.settlement"), obligationId: uuid,
    providerEventId: text(200), amountPence: z.literal(7900), currency: z.literal("GBP"),
    policyVersion: z.literal("synthetic_demo_illustrative.v1"), simulatedAt: timestamp,
  }).strict(),
  z.object({ ...common, ...document, operation: z.literal("quote.acceptance.attest"),
    acceptedTotalPence: pence, currency: z.literal("GBP"),
    statedCustomerName: text(160).refine(value => value.trim() === value, "expected validated trimmed name"),
    statedMethod: z.enum(["verbal", "email", "message", "signed-paper"]), acceptedAt: timestamp,
    evidenceId: uuid.nullable(), policyVersion: z.literal("builder-attestation.v1"),
  }).strict(),
  z.object({ ...disposition, operation: z.literal("quote.declined"), kind: z.literal("declined") }).strict(),
  z.object({ ...disposition, operation: z.literal("quote.superseded"), kind: z.literal("superseded") }).strict(),
  z.object({ ...disposition, operation: z.literal("quote.acceptance_cancelled"), kind: z.literal("acceptance_cancelled") }).strict(),
]).superRefine((input, context) => {
  if (input.operation !== "job.switch_live") return;
  const pilot = input.mode === "pilot_no_charge";
  if (input.activationTermsVersion !== (pilot ? "pilot_no_charge.v1" : "synthetic_demo_illustrative.v1") ||
    input.amountPence !== (pilot ? null : 7900) || input.currency !== (pilot ? null : "GBP")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "activation mode, terms and exact illustrative amount disagree" });
  }
});
export type Lp3OperationV1 = z.infer<typeof lp3OperationV1Schema>;

/** Length-prefixed UTF-8 tokens; independent of JSON key order and JSON escaping. */
export function lp3CanonicalInput(raw: unknown): string {
  const input = lp3OperationV1Schema.parse(raw);
  const tokens: (string | number | null)[] = [input.version, input.operation,
    input.tenantId, input.actorMembershipId, input.jobId];
  switch (input.operation) {
    case "job.switch_live":
      tokens.push(input.acceptedDocumentId, input.acceptedDocumentVersion, input.acceptedDocumentHash,
        input.expectedJobRevision, input.acceptedNetValuePence, input.recoveryCapPence, input.mode,
        input.activationTermsVersion, input.feePolicyVersion, input.amountPence, input.currency,
        input.recipient, input.activatedAt);
      break;
    case "synthetic.settlement":
      tokens.push(input.obligationId, input.providerEventId, input.amountPence, input.currency,
        input.policyVersion, input.simulatedAt);
      break;
    case "quote.acceptance.attest":
      tokens.push(input.documentId, input.documentVersion, input.documentHash, input.expectedJobRevision,
        input.acceptedTotalPence, input.currency, input.statedCustomerName, input.statedMethod,
        input.acceptedAt, input.evidenceId, input.policyVersion);
      break;
    case "quote.declined":
    case "quote.superseded":
    case "quote.acceptance_cancelled":
      tokens.push(input.documentId, input.documentVersion, input.documentHash, input.expectedJobRevision,
        input.kind, input.occurredAt, input.amountPence, input.currency, input.recipient, input.policyVersion);
      break;
  }
  return tokens.map(value => {
    if (value === null) return "-1:";
    const token = String(value);
    return `${Buffer.byteLength(token, "utf8")}:${token}`;
  }).join("");
}

/** A digest is a binding, never evidence that a caller has permission or approval. */
export function lp3PayloadHash(raw: unknown): string {
  return createHash("sha256").update(lp3CanonicalInput(raw), "utf8").digest("hex");
}
