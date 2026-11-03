import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { money, MoneyError } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import type { AuditEventInput } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.guid({ error: "Invalid uuid" });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
/** Shared boundary adapter; the public money kernel owns magnitude and integer rules. */
export const nonnegativeMoneyPenceSchema = z.number().nonnegative().superRefine((value, refinementIssues) => {
  try { money(value); }
  catch (error) {
    if (!(error instanceof MoneyError)) throw error;
    refinementIssues.addIssue({ code: z.ZodIssueCode.custom, message: error.message, params: { moneyCode: error.code } });
  }
});
const actionSchema = z.object({
  actionType: z.string().min(1).max(100), recipient: z.string().max(320).nullable(),
  contentHash: sha256, aggregateRevision: z.number().int().nonnegative(),
  amountPence: nonnegativeMoneyPenceSchema.nullable(), currency: z.literal("GBP").nullable(),
  policyVersion: z.string().min(1).max(80), expiresAt: z.coerce.date(),
}).strict().refine((v) => (v.amountPence === null) === (v.currency === null), "amount and currency must appear together");
export const consequentialCommandV1Schema = z.object({
  version: z.literal("command.v1"), commandId: uuid, commandType: z.string().min(1).max(100),
  semanticKey: z.string().min(1).max(300), actorMembershipId: uuid,
  subjectType: z.string().min(1).max(100), subjectRef: z.string().min(1).max(200),
  decisionId: uuid.optional(), resolutionId: uuid.optional(), authorizationId: uuid.optional(),
  action: actionSchema,
}).strict();
export type ConsequentialCommand = z.infer<typeof consequentialCommandV1Schema>;
export type ExactAction = z.infer<typeof actionSchema>;
export const decisionDismissCommandV1Schema = z.object({
  version:z.literal("decision-resolution-command.v1"),commandId:uuid,semanticKey:z.string().min(1).max(300),actorMembershipId:uuid,
  decisionId:uuid,findingFingerprint:sha256,resolution:z.enum(["dismissed","rejected"]),expectedSnapshotRevision:z.number().int().nonnegative(),
}).strict();
export type DecisionDismissCommand=z.infer<typeof decisionDismissCommandV1Schema>;

/** Contract reserved for M4. No dispatcher accepts this type while the gate is disabled. */
export interface StandingAuthorizationV1 {
  readonly version: "standing-authorization.v1"; readonly scope: string;
  readonly maximumAmountPence: number | null; readonly expiresAt: Date; readonly revokedAt: Date | null;
}
export const UNATTENDED_COMMERCIAL_EXECUTION_ENABLED = false as const;

export class CommandError extends Error {
  constructor(readonly code: "COMMAND_CONFLICT"|"FORBIDDEN"|"AUTHORIZATION_INVALID") { super(code); this.name="CommandError"; }
}
export interface CommandMutation<TResult extends Record<string, unknown>> {
  /** Must lock and mutate every business aggregate before returning. Audit append follows immediately. */
  inputHash?(command: ConsequentialCommand): string;
  lock?(database: TenantTransaction, command: ConsequentialCommand): Promise<void>;
  mutate(database: TenantTransaction, command: ConsequentialCommand): Promise<TResult>;
  auditEvents?(result: TResult, command: ConsequentialCommand): readonly AuditEventInput[];
}

/** Translate only boundary refusals, preserving route-specific errors. */
function commandFailure(error: unknown): never {
  const message = (error as { message?: string }).message;
  if (message === "FORBIDDEN" || message === "COMMAND_CONFLICT" || message === "AUTHORIZATION_INVALID") throw new CommandError(message);
  throw error;
}
async function requireOwner(database: TenantTransaction, tenantId: string, actor: string) {
  // Authority first, including replay and the route lock phase. No FK lock upgrade.
  const member = (await database.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2
    AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [tenantId, actor])).rows[0];
  if (!member) throw new CommandError("FORBIDDEN");
}
function outcomeReference(result: Record<string, unknown>): Record<string, unknown> {
  // These are hints to checked adapters, never a caller-authored success value.
  return Object.fromEntries(["eventId", "placementId", "invoiceId", "locked", "revision", "sourceJobId", "sourceBindingId"]
    .filter(key => key in result).map(key => [key, result[key]]));
}
export class UserCommandDispatcher {
  constructor(private readonly pool: Pool) {}
  async dispatch<TResult extends Record<string, unknown>>(context: VerifiedTenantContext, raw: unknown, handler: CommandMutation<TResult>): Promise<TResult> {
    const parsed = consequentialCommandV1Schema.parse(raw);
    // LP-3 independently checks this semantic-key binding. It is not the receipt
    // digest: begin_command derives that from the significant input itself.
    const binding = handler.inputHash?.(parsed);
    if (binding && !/^[a-f0-9]{64}$/u.test(binding)) throw new CommandError("AUTHORIZATION_INVALID");
    const command = binding ? { ...parsed, semanticKey: parsed.semanticKey.replace(/:lp3=[a-f0-9]{64}$/u, "") + `:lp3=${binding}` } : parsed;
    if (command.semanticKey.length > 300) throw new CommandError("COMMAND_CONFLICT");
    return withTenant(this.pool, context, async database => {
      await requireOwner(database, context.tenantId, command.actorMembershipId);
      await handler.lock?.(database, command);
      const resource = { tenantId: context.tenantId, actorMembershipId: command.actorMembershipId, subjectType: command.subjectType, subjectRef: command.subjectRef };
      const claimed = (await database.$client.query(`SELECT app.begin_command($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) result`,
        [command.version, command.commandId, command.commandType, command.semanticKey, JSON.stringify(resource),
          JSON.stringify({ aggregateRevision: command.action.aggregateRevision }), JSON.stringify(command)])).rows[0]!.result;
      if (claimed.kind === "replay") return claimed.result as TResult;
      const authorized = { ...command, decisionId: claimed.decisionId as string, resolutionId: claimed.resolutionId as string, authorizationId: claimed.authorizationId as string };
      const reference = await handler.mutate(database, authorized);
      const events = handler.auditEvents?.(reference, command) ?? [];
      if (events.length) await appendAuditBatch(database, events);
      // Handler output provides hints only; SQL builds the stored result from
      // business rows, then appends checked completion audit as the last lock.
      return (await database.$client.query<{ result: TResult }>(`SELECT app.complete_command($1,$2::jsonb) result`,
        [command.commandId, JSON.stringify(outcomeReference(reference))])).rows[0]!.result;
    }).catch(commandFailure);
  }
  /** Dismiss/reject creates a resolution, never an action authorization. */
  async dismissDecision(context: VerifiedTenantContext, raw: unknown): Promise<{ decisionId: string; resolution: "dismissed" | "rejected"; authorizedAction: false }> {
    const command = decisionDismissCommandV1Schema.parse(raw);
    return withTenant(this.pool, context, async database => {
      await requireOwner(database, context.tenantId, command.actorMembershipId);
      const resource = { tenantId: context.tenantId, actorMembershipId: command.actorMembershipId, subjectType: "decision", subjectRef: command.decisionId };
      const claimed = (await database.$client.query(`SELECT app.begin_command($1,$2,'finding.resolve',$3,$4::jsonb,$5::jsonb,$6::jsonb) result`,
        [command.version, command.commandId, command.semanticKey, JSON.stringify(resource),
          JSON.stringify({ snapshotRevision: command.expectedSnapshotRevision }), JSON.stringify(command)])).rows[0]!.result;
      if (claimed.kind === "replay") return claimed.result;
      const finding = (await database.$client.query<{ id: string }>(`SELECT id FROM app.job_finding WHERE tenant_id=$1 AND decision_id=$2
        AND fingerprint=$3 AND snapshot_revision=$4`, [context.tenantId, command.decisionId, command.findingFingerprint, command.expectedSnapshotRevision])).rows[0]!;
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${command.actorMembershipId}`,
        eventType: "finding.resolved", subjectType: "finding", subjectRef: finding.id, payload: { references: { commandId: command.commandId,
          decisionId: command.decisionId, findingFingerprint: command.findingFingerprint, resolution: command.resolution, authorizationCreated: "false" },
          classifications: { action: "operational" } } }]);
      return (await database.$client.query(`SELECT app.complete_command($1,'{}'::jsonb) result`, [command.commandId])).rows[0]!.result;
    }).catch(commandFailure);
  }
}

/** The only boundary allowed to invoke a commercial adapter. It always rechecks the exact immutable grant. */
export async function executeAuthorizedCommercialAction<T>(database: TenantTransaction, authorizationId: string, requested: ExactAction, invoke: () => Promise<T>): Promise<T> {
  uuid.parse(authorizationId); const action=actionSchema.parse(requested);
  const row=(await database.$client.query<Record<string,unknown>>(`SELECT a.* FROM app.action_authorization a
    JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id
    JOIN app.membership m ON m.tenant_id=a.tenant_id AND m.id=a.actor_membership_id
    WHERE a.id=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND r.resolution='approved'
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())`,[authorizationId])).rows[0];
  const matches=row && row.action_type===action.actionType && row.recipient===action.recipient && row.content_hash===action.contentHash &&
    Number(row.aggregate_revision)===action.aggregateRevision && (row.amount_pence===null?action.amountPence===null:Number(row.amount_pence)===action.amountPence) &&
    row.currency===action.currency && row.policy_version===action.policyVersion;
  if(!matches) throw new CommandError("AUTHORIZATION_INVALID");
  return invoke();
}
