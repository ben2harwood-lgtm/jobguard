import type { TenantTransaction } from "./tenant-context.js";

/** Operational lifecycle: preserve the route's locks and legacy JSON encoding,
 * while SQL derives the digest, rechecks authority and proves the stored result.
 * legacyJson is input, never a supplied digest; SQL verifies its decoded value.
 */
export async function beginRepositoryCommand<T>(db: TenantTransaction, spec: {
  tenantId: string; actorMembershipId: string; commandId: string; commandType: string;
  semanticKey: string; jobId: string; legacyJson: string;
}): Promise<{ kind: "claim" } | { kind: "replay"; result: T }> {
  const resource = { tenantId: spec.tenantId, actorMembershipId: spec.actorMembershipId, subjectType: "job", subjectRef: spec.jobId };
  const input = { version: "repository-command.v1", actorMembershipId: spec.actorMembershipId,
    input: JSON.parse(spec.legacyJson) as unknown, legacyJson: spec.legacyJson };
  return (await db.$client.query(`SELECT app.begin_command($1,$2,$3,$4,$5::jsonb,'{}'::jsonb,$6::jsonb) result`,
    [input.version, spec.commandId, spec.commandType, spec.semanticKey, JSON.stringify(resource), JSON.stringify(input)])).rows[0]!.result as
    { kind: "claim" } | { kind: "replay"; result: T };
}

/** Only references reach completion; the adapter rebuilds every returned field. */
export async function completeRepositoryCommand<T>(db: TenantTransaction, commandId: string, references: {
  id?: unknown; revisionId?: unknown;
} = {}): Promise<T> {
  return (await db.$client.query(`SELECT app.complete_command($1,$2::jsonb) result`,
    [commandId, JSON.stringify(references)])).rows[0]!.result as T;
}
