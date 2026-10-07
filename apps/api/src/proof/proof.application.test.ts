import{describe,expect,it}from"vitest";import{hasCompleteImage}from"@jobguard/db";import{proofCommandV1}from"./contracts.js";import{generatePracticePng}from"./proof.application.js";
describe("UIWIRE-7 proof API service boundary",()=>{it("generates a complete runtime PNG rather than a committed binary or header",()=>{const bytes=generatePracticePng();expect(hasCompleteImage(bytes,"image/png")).toBe(true);expect(hasCompleteImage(bytes.subarray(0,16),"image/png")).toBe(false);const corrupt=Buffer.from(bytes);corrupt.fill(0,45,55);expect(hasCompleteImage(corrupt,"image/png")).toBe(false)});it("strictly rejects deployment modes, arbitrary bytes and wrong actions",()=>{const base={version:"practice-proof-command.v1",action:"select_generated",commandId:crypto.randomUUID(),scopeItemId:crypto.randomUUID(),fixture:"completion-photo"};expect(proofCommandV1.safeParse(base).success).toBe(true);for(const extra of[{deploymentMode:"production"},{bytes:"real-upload"},{amount:1},{action:"send"}])expect(proofCommandV1.safeParse({...base,...extra}).success).toBe(false)})});


// Exercise the actual ownership lookup and application error mapping; only DB/storage
// infrastructure and the proof command outcome are doubled here.
import type { Pool } from "pg";
import { afterEach, vi } from "vitest";
import { ProofCommandError, ProofCommandService } from "@jobguard/db";
import { ProofApplication } from "./proof.application.js";
import { createHash } from "node:crypto";
const jobId = "18000000-0000-4000-8000-000000000001";
const scopeId = "18000000-0000-4000-8000-000000000002";
const pendingId = "18000000-0000-4000-8000-000000000003";
const tenantId = "11111111-1111-4111-8111-111111111111";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(["owned pending upload", "foreign upload", "unknown evidence"])(
  "proof complete preserves ownership and domain validation for %s", async scenario => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("authenticate_practice_session")) return { rows: [{ tenant_id: tenantId, membership_id: jobId, identity_user_id: scopeId }] };
      if (sql.includes("practice_session_digest=$3")) return { rows: [{ id: jobId }] };
      if (sql.startsWith("SELECT 1 FROM app.membership")) return { rows: [{}] };
      if (sql.includes("SELECT id FROM app.evidence")) {
        expect(values).toEqual([tenantId, jobId, pendingId]);
        return { rows: scenario === "owned pending upload" && sql.includes("app.evidence_upload") ? [{ id: pendingId }] : [] };
      }
      return { rows: [] };
    });
    const pool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
    const app = new ProofApplication(pool, jobId);
    const get = vi.spyOn(app, "get").mockResolvedValue({ scopeItemId: scopeId, decisionId: null } as never);
    const complete = vi.spyOn(ProofCommandService.prototype, "complete").mockRejectedValue(new ProofCommandError("PROOF_NOT_FINAL"));
    await expect(app.command(jobId, { version: "practice-proof-command.v1", action: "complete", commandId: jobId, scopeItemId: scopeId, evidenceId: pendingId })).rejects.toThrow(
      scenario === "owned pending upload" ? "PROOF_INVALID" : "NOT_FOUND");
    expect(complete).toHaveBeenCalledTimes(scenario === "owned pending upload" ? 1 : 0);
    expect(get).toHaveBeenCalledTimes(scenario === "owned pending upload" ? 1 : 0);
  });

// Transaction-aware infrastructure double: run the real application, evidence service,
// identity/result routines and response repository. Physical rollback/races are also
// covered by proof-application-records.integration.test.ts in PostgreSQL CI.
function finalizeFixture(path: "existing" | "concurrent") {
  const bytes = generatePracticePng(), version = "synthetic-v1";
  const command = { version: "practice-proof-command.v1", action: "finalize", commandId: scopeId, uploadId: pendingId, objectVersionId: version };
  type State = { identity?: Record<string, unknown>; result?: unknown; response?: Record<string, unknown> };
  let committed: State = {}, existing = path === "existing", failResponse = true, decisionId: string | null = null;
  const object = { id: pendingId, upload_id: pendingId, object_version_id: version, evidence_type: "electrical_certificate" };
  const statements: string[] = [];
  const rowsFor = (sql: string, values: unknown[], state: State): unknown[] => {
    if (sql.includes("authenticate_practice_session")) return [{ tenant_id: tenantId, membership_id: jobId, identity_user_id: scopeId }];
    if (sql.includes("practice_session_digest=$3") || sql.startsWith("SELECT 1 FROM app.membership") || sql.startsWith("SELECT 1 FROM app.job j")) return [{}];
    if (sql.startsWith("SELECT id FROM app.evidence_upload")) return [{ id: pendingId }];
    if (sql.startsWith("SELECT 1 FROM app.evidence_upload")) return [{}];
    if (sql.startsWith("SELECT job_id FROM app.evidence_upload")) return [{ job_id: jobId }];
    if (sql.startsWith("SELECT job_id,command_type,request_hash")) return state.identity ? [state.identity] : [];
    if (sql.startsWith("SELECT result FROM app.watchdog_command_result")) return state.result ? [{ result: state.result }] : [];
    if (sql.startsWith("SELECT * FROM app.evidence_object")) return existing ? [object] : [];
    if (sql.startsWith("SELECT * FROM app.evidence_upload")) return [{ job_id: jobId, state: "pending", object_key: "synthetic-key", object_version_id: version,
      expires_at: new Date("2099-01-01"), maximum_bytes: bytes.length, expected_content_type: "image/png", expected_sha256: createHash("sha256").update(bytes).digest("hex") }];
    if (sql.startsWith("SELECT bytes,content_type")) {
      // Another finalizer commits while this caller reads storage outside its transaction.
      existing = true;
      return [{ bytes, content_type: "image/png" }];
    }
    if (sql.startsWith("INSERT INTO app.watchdog_command_identity")) {
      state.identity = { job_id: values[2], command_type: values[3], request_hash: values[4] };
      return [{ command_id: values[1] }];
    }
    if (sql.startsWith("INSERT INTO app.watchdog_command_result")) { state.result = JSON.parse(values[2] as string); return []; }
    if (sql.startsWith("SELECT job_id,action,request_hash,response")) return state.response ? [state.response] : [];
    if (sql.startsWith("INSERT INTO app.proof_application_response")) {
      if (failResponse) throw new Error("synthetic response-write failure");
      state.response = { job_id: values[2], action: values[3], request_hash: values[5], response: JSON.parse(values[6] as string) };
      return [{ response: state.response.response }];
    }
    if (sql.startsWith("SELECT id FROM app.scope_identity")) return [{ id: scopeId }];
    if (sql.startsWith("SELECT u.id,u.state")) return [{ id: pendingId, state: "verified", object_version_id: version, evidence_id: pendingId }];
    if (sql.startsWith("SELECT d.id FROM app.decision")) return decisionId ? [{ id: decisionId }] : [];
    return [];
  };
  const pool = {
    query: async (sql: string, values: unknown[] = []) => ({ rows: rowsFor(sql, values, committed) }),
    connect: async () => {
      let working: State = {};
      return { release() {}, query: async (sql: string, values: unknown[] = []) => {
        statements.push(sql);
        if (sql === "BEGIN") working = structuredClone(committed);
        if (sql === "COMMIT") committed = working;
        const rows = rowsFor(sql, values, working);
        return { rows, rowCount: rows.length };
      } };
    },
  } as unknown as Pool;
  return { app: new ProofApplication(pool, jobId), command, statements, state: () => committed,
    allowResponse: () => { failResponse = false; }, changeProjection: () => { decisionId = jobId; } };
}

describe.each(["existing", "concurrent"] as const)("round 13: %s-object finalization under a fresh command ID", path => {
  it("a response-write failure rolls back the new identity and result", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const f = finalizeFixture(path);
    const error = await f.app.command(jobId, f.command).catch(error => error);
    expect(f.state()).toEqual({});
    expect(f.statements).toContain("ROLLBACK");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("PROOF_INVALID");
  });
  it("records the first answer in the completing transaction and retries return identical bytes after the projection changes", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const f = finalizeFixture(path);
    f.allowResponse();
    const first = JSON.stringify(await f.app.command(jobId, f.command));
    const claim = f.statements.findIndex(sql => sql.startsWith("INSERT INTO app.watchdog_command_identity"));
    const commit = f.statements.indexOf("COMMIT", claim);
    const response = f.statements.findIndex(sql => sql.startsWith("INSERT INTO app.proof_application_response"));
    expect(response).toBeGreaterThan(claim);
    expect(response).toBeLessThan(commit);
    f.changeProjection();
    expect(JSON.stringify(await f.app.get(jobId))).not.toBe(first);
    const beforeReplay = f.statements.length;
    expect(JSON.stringify(await f.app.command(jobId, f.command))).toBe(first);
    expect(f.statements.slice(beforeReplay).some(sql => /^(INSERT|UPDATE|DELETE)/u.test(sql))).toBe(false);
  });
});
