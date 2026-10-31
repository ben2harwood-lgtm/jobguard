import { z } from "zod";
import { exactPenceV1, parseExactPence } from "./cumulative-fee.js";
import { EVIDENCE_PACK_SANDBOX_BANNER, sha256 } from "./evidence-pack.js";
import { money } from "./money.js";

export const SIMULATION_FEE_STATEMENT_WARNING = "Simulation statement — proposed policy, principal only; not a tax invoice or real amount due";
export const SIMULATION_FEE_STATEMENT_VAT_LABEL = "VAT not calculated";

const id = z.string().uuid();
const signedMoney = z.object({ pence: z.number(), currency: z.literal("GBP") }).strict()
  .transform((value, context) => {
    try { return money(value.pence); } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid Money" });
      return z.NEVER;
    }
  });
const nonnegativeMoney = signedMoney.refine(value => value.pence >= 0, "Negative cumulative principal");
const qualifyingPrincipal = exactPenceV1.refine(value => {
  try { return parseExactPence(value).numerator >= 0n; } catch { return false; }
}, "Invalid qualifying principal");

/**
 * Pure representation only, never a client command or proof of issuance/approval.
 * Source manifests and approval bindings deliberately await the Q2-aligned persistence contract.
 * A supplied number is represented verbatim; this module neither assigns nor reserves numbers.
 */
export const simulationFeeStatementDocumentV1 = z.object({
  version: z.literal("simulation-fee-statement-document.v1"),
  statementId: id,
  number: z.string().min(1).max(80),
  environment: z.literal("synthetic_demo"),
  policyVersion: z.literal("reference_fee_policy_v3"),
  qualifyingPrincipal,
  cumulativeFeePrincipal: nonnegativeMoney,
  documentPrincipal: signedMoney,
  postingHistory: z.array(z.object({ journalId: id, principal: signedMoney }).strict()).max(10_000),
  original: z.object({ statementId: id, documentHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict().nullable(),
  settlementHistory: z.object({ state: z.literal("integration_unavailable"), dependency: z.literal("M4-12-S") }).strict(),
  warning: z.literal(SIMULATION_FEE_STATEMENT_WARNING),
  vatLabel: z.literal(SIMULATION_FEE_STATEMENT_VAT_LABEL),
  sandboxLabel: z.literal(EVIDENCE_PACK_SANDBOX_BANNER),
}).strict();
export type SimulationFeeStatementDocument = z.infer<typeof simulationFeeStatementDocumentV1>;

export class SimulationFeeStatementError extends Error {
  readonly code = "INVALID_SIMULATION_FEE_STATEMENT";
  constructor() { super("INVALID_SIMULATION_FEE_STATEMENT"); this.name = "SimulationFeeStatementError"; }
}

// Restricted to the validated JSON representation: sorted object keys, preserved array order,
// JSON escaping/numbers, no whitespace/BOM/trailing newline. Locale never affects the bytes.
export function canonicalSimulationFeeStatementJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSimulationFeeStatementJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalSimulationFeeStatementJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value)!;
}

/** No DB/provider port, identifiers, allocation, entitlement arithmetic or approval capability. */
export function formatSimulationFeeStatement(raw: unknown) {
  const parsed = simulationFeeStatementDocumentV1.safeParse(raw);
  if (!parsed.success) throw new SimulationFeeStatementError();
  const document = parsed.data;
  const canonicalJson = canonicalSimulationFeeStatementJson(document);
  const bytes = new TextEncoder().encode(canonicalJson);
  return Object.freeze({ document, canonicalJson, bytes, byteLength: bytes.byteLength, documentHash: sha256(canonicalJson) });
}
