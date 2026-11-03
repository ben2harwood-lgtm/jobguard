import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { vi, type Mock } from "vitest";
import { importActionHashV3 } from "../../core/dist/job-import-v3.js";
import { importFixtureV3, IMPORT_V3_FIXTURE_ID, importTargetJobIdV3 } from "../src/job-import-v3-fixtures.js";
import { consequentialCommandV1Schema } from "../src/commands.js";
import { createWorkFixture, seedWorkPractice, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
export const T = "11111111-1111-4111-8111-111111111111", J = "c5500000-0000-4000-8000-000000000003", M = "d1500000-0000-4000-8000-000000000003", D = "a".repeat(64);
export const parties = { bindingId: "c5500000-0000-4000-8000-000000000004", customerRevisionId: "c5500000-0000-4000-8000-000000000005", siteRevisionId: "c5500000-0000-4000-8000-000000000006", payingPartyRevisionId: "c5500000-0000-4000-8000-000000000005" };
export const preview = { version: "job-import-preview.v3", expectedBindingId: parties.bindingId, fixtureId: IMPORT_V3_FIXTURE_ID, lifecyclePoint: "live" as const };
export const approved = importFixtureV3(J, parties, "live", IMPORT_V3_FIXTURE_ID);
export const intent = { version: "job-parties-import.v3", commandId: "c5500000-0000-4000-8000-000000000007", expectedBindingId: parties.bindingId, fixtureId: IMPORT_V3_FIXTURE_ID, lifecyclePoint: "live", previewHash: importActionHashV3(approved), attest: true };
export const command = consequentialCommandV1Schema.parse({ version: "command.v1", commandId: intent.commandId, commandType: "job.adopt_in_flight_v3", semanticKey: `import-v3:${intent.commandId}`, actorMembershipId: M, subjectType: "job", subjectRef: importTargetJobIdV3(T, D, intent.commandId), action: { actionType: "job.adopt_in_flight_v3", recipient: null, contentHash: intent.previewHash, aggregateRevision: 0, amountPence: approved.baseline.acceptedNetPence, currency: "GBP", policyVersion: "synthetic_demo_import.v3", expiresAt: new Date("2099-01-01T00:00:00Z") } });

/** Unit-only scripted SQL transport; proves application behavior, never DB guarantees. */
type ScriptQuery = (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
type ScriptedImportPool = {
  pool: Pool; query: Mock<ScriptQuery>; release: Mock<() => void>; context: ReturnType<typeof testTenantContext>;
  state: { authenticated: boolean; owns: boolean; actor: string; binding: typeof parties };
};
export function scriptedImportPool(): ScriptedImportPool {
  const state = { authenticated: true, owns: true, actor: M, binding: { ...parties } };
  const query = vi.fn<ScriptQuery>(async (sql: string, _values?: unknown[]) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SELECT set_config")) return { rows: [], rowCount: 0 };
    if (sql.includes("authenticate_practice_session")) return { rows: state.authenticated ? [{ membership_id: state.actor }] : [], rowCount: state.authenticated ? 1 : 0 };
    if (sql.includes("FROM practice_owned_job WHERE")) return { rows: state.owns ? [{ id: J }] : [], rowCount: state.owns ? 1 : 0 };
    if (sql.includes("FROM app.job_party_current")) return { rows: [state.binding], rowCount: 1 };
    if (sql.includes("FROM app.job_import_v3")) return { rows: [], rowCount: 0 };
    if ((sql.startsWith("SELECT role FROM app.membership") || sql.startsWith("SELECT 1 FROM app.membership"))) return { rows: [{ role: "owner" }], rowCount: 1 };
    throw new Error(`Unexpected SQL in unit transport: ${sql}`);
  });
  const release = vi.fn(), client = { query, release }, pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, query, state, release, context: testTenantContext(T) };
}
export async function createImportFixture() {
  const f = await createWorkFixture();
  try {
    const p = await seedWorkPractice(f);
    const binding = (await f.admin.query("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2", [p.auth.context.tenantId, p.jobId])).rows[0].binding_id as string;
    const request = { ...preview, expectedBindingId: binding };
    return { ...f, practice: p, request };
  } catch (e) { await closeWorkFixture(f); throw e; }
}
export type ImportFixture = Awaited<ReturnType<typeof createImportFixture>>;
export { closeWorkFixture };
export async function importState(f: WorkFixture) {
  const result: Record<string, unknown> = {};
  for (const table of ["app.job", "app.imported_job_baseline", "app.command_receipt", "app.action_authorization", "app.decision_resolution", "app.audit_event", "app.job_work_state_event", "app.synthetic_obligation", "app.recovery_fee_journal", "app.customer_invoice"])
    result[table] = (await f.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) rows FROM ${table} x`)).rows[0].rows;
  return result;
}
export const freshIntent = (bindingId: string, hash: string, lifecyclePoint: "live" | "invoiced" = "live") => ({ ...intent, commandId: randomUUID(), expectedBindingId: bindingId, lifecyclePoint, previewHash: hash });
