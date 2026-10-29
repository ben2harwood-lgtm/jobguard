import { z } from "zod";
import { parseConnectorEnvironment } from "@jobguard/config";
import { materialsIssueV1, workOrderRowV1 } from "@jobguard/core";
import type { FakeDeliveryResult, OutboundAction, OutboundAdapter } from "@jobguard/db";
import { parseBillingImportEnvelope } from "../contractor/billing.contracts.js";
import { validateSyntheticBillingAction } from "../contractor/billing.adapters.js";

const label = z.string().regex(/^fixture:[a-z0-9_-]+$(?![\s\S])/u);
const operation = z.enum(["work_orders", "billing_status", "materials_issues", "export_delivery"]);
const scopeV1 = z.object({ version: z.literal("sftp-fixture-scope.v1"), tenantId: z.guid(),
  clientContractId: z.guid(), operations: z.array(operation).min(1).max(4),
  maxBytes: z.number().int().positive().max(5_000_000),
}).strict();
const fileV1 = z.object({ version: z.literal("sftp-fixture-file.v1"), tenantId: z.guid(),
  clientContractId: z.guid(), operation: operation.exclude(["export_delivery"]),
  source: label, eventId: label, payload: z.unknown(),
}).strict();
type Scope = z.infer<typeof scopeV1>;
export class SyntheticSftpError extends Error {
  constructor(readonly code: "SFTP_INVALID" | "SFTP_FORBIDDEN" | "SFTP_CONFLICT") { super(code); }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new SyntheticSftpError("SFTP_INVALID");
  return result.data;
}
function requireOperation(scope: Scope, op: z.infer<typeof operation>) {
  if (!scope.operations.includes(op)) throw new SyntheticSftpError("SFTP_FORBIDDEN");
}
function validatePayload(file: z.infer<typeof fileV1>) {
  if (file.operation === "work_orders") {
    const row = parse(workOrderRowV1, file.payload);
    if (row.contractId !== file.clientContractId) throw new SyntheticSftpError("SFTP_FORBIDDEN");
    return row;
  }
  if (file.operation === "materials_issues") return parse(materialsIssueV1, file.payload);
  const input = parseBillingImportEnvelope(file.payload);
  if (input.observations.some(o => o.event.clientContractId !== file.clientContractId)) {
    throw new SyntheticSftpError("SFTP_FORBIDDEN");
  }
  return input;
}

/** In-memory fake server only, with fixture credentials, no sockets, secrets or filesystem paths.
 * Scope is selected by the test harness, NOT authenticated machine authority. Nothing registers
 * this seam in HTTP, workers or an executor. Domain writes and durable receipts remain elsewhere.
 */
export function createInMemorySftpServer() {
  const files = new Map<string, string>();
  const deliveries = new Map<string, { binding: string; accepted: boolean; absenceKnown: boolean; result: FakeDeliveryResult }>();
  const observations = new Map<string, string>();
  return {
    // Harness deliberately permits malformed remote bytes for boundary/fault tests.
    seed(rawName: unknown, bytes: string) { files.set(parse(label, rawName), bytes); },
    connect(rawEnvironment: unknown, rawScope: unknown, scenario: "success" | "unknown_accepted" | "unknown_absent" | "unknown_unresolved" = "success") {
      const environment = parseConnectorEnvironment(rawEnvironment);
      const scope = parse(scopeV1, rawScope);
      if (!["success", "unknown_accepted", "unknown_absent", "unknown_unresolved"].includes(scenario)) {
        throw new SyntheticSftpError("SFTP_INVALID");
      }
      const partition = JSON.stringify([scope.tenantId, scope.clientContractId, environment.CONNECTOR_ENDPOINT_REF]);
      const adapter: OutboundAdapter = {
        name: "fake_sftp", supportsProviderDeduplication: true,
        async deliver(rawAction: Readonly<OutboundAction>) {
          requireOperation(scope, "export_delivery");
          const { action } = validateSyntheticBillingAction(rawAction);
          // The shared verifier has already validated the exact canonical JSON and its hash.
          const artifact = JSON.parse(action.immutableContent) as { clientContractId: string };
          if (action.adapter !== "fake_sftp" || artifact.clientContractId !== scope.clientContractId) {
            throw new SyntheticSftpError("SFTP_FORBIDDEN");
          }
          if (Buffer.byteLength(action.immutableContent) > scope.maxBytes) throw new SyntheticSftpError("SFTP_INVALID");
          const key = JSON.stringify([partition, action.providerEffectKey]);
          const binding = JSON.stringify([action.recipient, action.contentHash, action.immutableContent,
            action.aggregateRevision, action.amountPence, action.currency, action.policyVersion]);
          const previous = deliveries.get(key);
          if (previous) {
            if (previous.binding !== binding) throw new SyntheticSftpError("SFTP_CONFLICT");
            return { ...previous.result };
          }
          const accepted = scenario === "success" || scenario === "unknown_accepted";
          const result: FakeDeliveryResult = scenario === "success"
            ? { kind: "succeeded", providerReference: "fictional:sftp-receipt" }
            : { kind: "outcome_unknown", code: "FICTIONAL_SFTP_UNKNOWN" };
          deliveries.set(key, { binding, accepted, absenceKnown: scenario === "unknown_absent", result });
          return { ...result };
        },
        async reconcile(effectKey: string) {
          requireOperation(scope, "export_delivery");
          const previous = deliveries.get(JSON.stringify([partition, effectKey]));
          // Lost server state is not proof of absence; never enable blind resend after restart.
          if (!previous) return "unknown";
          if (previous.accepted) {
            previous.result = { kind: "succeeded", providerReference: "fictional:sftp-receipt" };
            return "succeeded";
          }
          return previous.absenceKnown ? "not_found" : "unknown";
        },
      };
      return {
        adapter,
        async pull(rawName: unknown, rawOperation: unknown) {
          const name = parse(label, rawName), op = parse(operation.exclude(["export_delivery"]), rawOperation);
          requireOperation(scope, op);
          const bytes = files.get(name);
          if (bytes === undefined || Buffer.byteLength(bytes) > scope.maxBytes) throw new SyntheticSftpError("SFTP_INVALID");
          let raw: unknown;
          try { raw = JSON.parse(bytes); } catch { throw new SyntheticSftpError("SFTP_INVALID"); }
          const file = parse(fileV1, raw);
          // Check scope before domain parsing or disclosure. No caller tenant selector exists.
          if (file.tenantId !== scope.tenantId || file.clientContractId !== scope.clientContractId || file.operation !== op) {
            throw new SyntheticSftpError("SFTP_FORBIDDEN");
          }
          let payload: unknown;
          try { payload = validatePayload(file); } catch (error) {
            if (error instanceof SyntheticSftpError) throw error;
            throw new SyntheticSftpError("SFTP_INVALID");
          }
          const key = JSON.stringify([scope.tenantId, scope.clientContractId, op, file.source, file.eventId]);
          const binding = file.operation === "billing_status"
            ? JSON.stringify((payload as ReturnType<typeof parseBillingImportEnvelope>).observations.map(o => o.canonical).sort())
            : JSON.stringify(payload);
          const prior = observations.get(key);
          if (prior !== undefined && prior !== binding) throw new SyntheticSftpError("SFTP_CONFLICT");
          observations.set(key, binding);
          // A parsed proposal only; never a posted fact, allocation or authority to execute it.
          return { version: "sftp-fixture-pull.v1" as const, operation: op, source: file.source,
            eventId: file.eventId, replayed: prior !== undefined, payload };
        },
      };
    },
    get simulatedEffects() { return [...deliveries.values()].filter(d => d.accepted).length; },
  };
}
