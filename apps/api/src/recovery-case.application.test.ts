import { PracticeAccess } from "./practice-access.js";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, PracticeAccessError, RecoveryCaseRepository } from "@jobguard/db";
import { RecoveryCaseApplication, recoveryCommandFailure, recoveryReadFailure } from "./recovery-case.application.js";
import { PracticeErrorsFilter } from "./practice-errors.filter.js";
import { recoveryCaseCommandV1 } from "./recovery-case.contracts.js";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
const session = randomUUID();
const principal = {digest:"a".repeat(64),context:{tenantId:randomUUID()},membershipId:DEMO_MEMBERSHIP_ID,identityUserId:DEMO_IDENTITY_USER_ID};
const testPool = () => ({query:vi.fn().mockRejectedValue(new Error("DATABASE_UNAVAILABLE"))}) as unknown as Pool;
const authorize = () => vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(principal as never);
const command=()=>({version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:randomUUID(),expectedCaseRevision:2,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1,scenario:"evidence_backed_withheld_payment"});
it("passes the server-selected synthetic membership for database verification, never a reviewer literal",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 authorize();
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue({id:randomUUID()} as never);
 vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([]);
 const body=command(),job=randomUUID();
 await new RecoveryCaseApplication(testPool(), session).eligibility(job,body,randomUUID());
 expect(persist).toHaveBeenCalledWith(expect.anything(),job,body,{membershipId:DEMO_MEMBERSHIP_ID,identityUserId:DEMO_IDENTITY_USER_ID});
});
it.each([undefined,"not-a-session"])("rejects absent or malformed session %s before a write",async session=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue(undefined as never);
 await expect(new RecoveryCaseApplication(testPool(), session).eligibility(randomUUID(),command(),session)).rejects.toThrow("UNAUTHENTICATED");
 expect(persist).not.toHaveBeenCalled();
});
it.each(["production","pilot_no_charge"])("refuses synthetic reviewer authority in %s",async mode=>{
 vi.stubEnv("JOBGUARD_ENV",mode);
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue(undefined as never);
 await expect(new RecoveryCaseApplication(testPool(), session).eligibility(randomUUID(),command(),randomUUID())).rejects.toThrow("ELIGIBILITY_REVIEWER_FORBIDDEN");
 expect(persist).not.toHaveBeenCalled();
});
// M4-1-S-R repair 10 (Sol P2): the real PracticeAccess boundary guards the read, not only the writes (no mock of it here).
it.each(["production", "pilot_no_charge"])("refuses to list cases in %s before it reads anything", async mode => {
 vi.stubEnv("JOBGUARD_ENV",mode);
 const list=vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([]);
 const refusal=new RecoveryCaseApplication(testPool(), session).list(randomUUID());
 await expect(refusal).rejects.toMatchObject({message:"SYNTHETIC_MODE_REQUIRED",code:"SYNTHETIC_MODE_REQUIRED"});
 const error=await refusal.catch(cause=>cause),json=vi.fn(),status=vi.fn(()=>({json}));
 new PracticeErrorsFilter().catch(error,{switchToHttp:()=>({getResponse:()=>({status})})} as never);
 expect(status).toHaveBeenCalledWith(403);
 expect(json).toHaveBeenCalledWith({code:"SYNTHETIC_MODE_REQUIRED"});
 expect(list).not.toHaveBeenCalled();
});
it("lists nothing when the membership and job lookup itself cannot be completed", async () => {
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const list=vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([]);
 await expect(new RecoveryCaseApplication(testPool(), session).list(randomUUID())).rejects.toThrow("DATABASE_UNAVAILABLE");
 expect(list).not.toHaveBeenCalled();
});
// M4-1-S-R repair 11 (Sol P2-5): an eligibility command also names the case it affected.
it("returns the id of the case an eligibility command affected, as the repository returned it",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 authorize();
 const affected=randomUUID(),later=randomUUID();
 vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue({id:affected} as never);
 vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([{id:affected},{id:later}] as never);
 const response=await new RecoveryCaseApplication(testPool(), session).eligibility(randomUUID(),command(),randomUUID());
 expect(response.affectedCaseId).toBe(affected);
});

it("an eligibility command that committed cannot turn its answer-read failure into a refusal", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 authorize();
 const persist = vi.spyOn(RecoveryCaseRepository.prototype, "eligibilityCommand").mockResolvedValue({ id: randomUUID() } as never);
 vi.spyOn(RecoveryCaseRepository.prototype, "listForMember").mockRejectedValue(new Error("ELIGIBILITY_STALE_REVISION"));
 await expect(new RecoveryCaseApplication(testPool(), session).eligibility(randomUUID(), command(), randomUUID())).rejects.toMatchObject({ code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN" });
 expect(persist).toHaveBeenCalledTimes(1);
});
it.each([["UNAUTHENTICATED",401],["MEMBERSHIP_FORBIDDEN",403],["JOB_NOT_FOUND",404],["DATABASE_UNAVAILABLE",503]] as const)("maps a read failure %s to %i and never to an unknown command outcome",(code,status)=>{
 expect(recoveryReadFailure(Object.assign(new Error(code),{code}))).toEqual({status,body:{code}});
});
it.each(["ECONNRESET","57P01","SOMETHING_ELSE"])("answers an unclassified read failure %s with 503, not a 4xx refusal",code=>{
 expect(recoveryReadFailure(Object.assign(new Error("connection lost"),{code}))).toEqual({status:503,body:{code:"DATABASE_UNAVAILABLE"}});
 expect(recoveryReadFailure("not an error")).toEqual({status:503,body:{code:"DATABASE_UNAVAILABLE"}});
});
it("a forbidden transition answers 400 with the domain sentence, not the bare code",()=>{
 const error=Object.assign(new Error("record_landing is not allowed from closed_recovered"),{code:"RECOVERY_TRANSITION_FORBIDDEN"});
 expect(recoveryCommandFailure(error)).toEqual({status:400,body:{code:"RECOVERY_TRANSITION_FORBIDDEN",message:"record_landing is not allowed from closed_recovered"}});
});

// Repair 16: pin the server's recognised code/status pairs alongside the browser classifier's adversarial tests.
it.each([
 ["UNAUTHENTICATED",401], ["MEMBERSHIP_FORBIDDEN",403], ["RECOVERY_REVIEWER_FORBIDDEN",403], ["ELIGIBILITY_REVIEWER_FORBIDDEN",403],
 ["JOB_NOT_FOUND",404], ["RECOVERY_JOB_NOT_FOUND",404], ["RECOVERY_CASE_NOT_FOUND",404], ["ELIGIBILITY_REVIEW_NOT_FOUND",404],
 ["RECOVERY_STALE_REVISION",409], ["ELIGIBILITY_STALE_REVISION",409], ["ELIGIBILITY_REVIEW_REQUIRED",409], ["IDEMPOTENCY_PAYLOAD_CONFLICT",409],
 ["RECOVERY_SOURCE_NOT_RECOGNISED",400], ["RECOVERY_TRANSITION_FORBIDDEN",400], ["RECOVERY_CLAIM_BELOW_SETTLED",400],
 ["RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE",400], ["ELIGIBILITY_NOT_APPROVABLE",400],
] as const)("repair 16: command failure %s has the expected application status %i", (code,status) => {
 const failure=recoveryCommandFailure(Object.assign(new Error(code),{code}));
 expect(failure.status).toBe(status);
 expect(failure.body.code).toBe(code);
 expect(failure.body.message).toEqual(expect.any(String));
});
it("repair 16: invalid command parsing is an application 400, while unclassified failures stay unknown", () => {
 const invalid=recoveryCaseCommandV1.safeParse({});
 expect(invalid.success).toBe(false);
 if(!invalid.success)expect(recoveryCommandFailure(invalid.error)).toEqual({status:400,body:{code:"INVALID_COMMAND"}});
 for(const code of ["REQUEST_TIMEOUT","ECONNRESET","57P01"]){
  expect(recoveryCommandFailure(new Error(code))).toMatchObject({status:503,body:{code:"RECOVERY_COMMAND_OUTCOME_UNKNOWN",outcome:"unknown"}});
 }
});

// Repair 17: inherited properties are not application statuses, for either error representation.
it.each(["constructor", "toString", "__proto__"])("repair 17: inherited read status %s defaults to DATABASE_UNAVAILABLE", code => {
 expect(recoveryReadFailure(new Error(code))).toEqual({status:503,body:{code:"DATABASE_UNAVAILABLE"}});
 expect(recoveryReadFailure(Object.assign(new Error("driver failure"),{code}))).toEqual({status:503,body:{code:"DATABASE_UNAVAILABLE"}});
});

it.each(["command","eligibility"] as const)("%s uses the verified session's principal for writes and membership-checked reply reads",async method=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const owner={digest:"b".repeat(64),context:{tenantId:randomUUID()},membershipId:randomUUID(),identityUserId:randomUUID()},affected=randomUUID();
 const access=vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(owner as never);
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,method==="command"?"command":"eligibilityCommand").mockResolvedValue({id:affected} as never);
 const list=vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockResolvedValue([{id:affected}] as never);
 const body=method==="eligibility"?command():{version:"recovery-case-command.v1",action:"transition",commandId:randomUUID(),caseId:affected,eventType:"assemble_evidence",expectedRevision:1};
 const job=randomUUID(),reviewer={membershipId:owner.membershipId,identityUserId:owner.identityUserId};
 const reply=await new RecoveryCaseApplication(testPool(),session)[method](job,body);
 expect(persist).toHaveBeenCalledWith(owner.context,job,body,reviewer);
 expect(list).toHaveBeenCalledWith(owner.context,job,reviewer);
 expect(access.mock.invocationCallOrder[0]).toBeLessThan(persist.mock.invocationCallOrder[0]!);
 expect(reply.affectedCaseId).toBe(affected);
});
it("a practice refusal during a committed reply remains an unknown outcome",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");authorize();
 const persist=vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand").mockResolvedValue({id:randomUUID()} as never);
 vi.spyOn(RecoveryCaseRepository.prototype,"listForMember").mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
 let error:unknown;try{await new RecoveryCaseApplication(testPool(),session).eligibility(randomUUID(),command())}catch(cause){error=cause}
 expect(recoveryCommandFailure(error)).toMatchObject({status:503,body:{code:"RECOVERY_COMMAND_OUTCOME_UNKNOWN",outcome:"unknown"}});
 expect(persist).toHaveBeenCalledTimes(1);
});

// Repair 20: the application hands the authorised session's digest to the repository. The real-PostgreSQL proof of what that
// scope does lives in packages/db (../src only); here the pool is a recording fake, so the wiring is proven without a database.
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
type Statement = { sql: string; values?: unknown[] | undefined };
function recordingPool() {
 const log: Statement[] = [];
 const client = { query: vi.fn(async (sql: string, values?: unknown[]) => { log.push({ sql, values }); return { rows: [], rowCount: 0 }; }), release: vi.fn() };
 const connect = vi.fn(async () => client);
 return { pool: { connect, query: vi.fn(async (sql: string, values?: unknown[]) => { log.push({ sql, values }); return { rows: [] }; }) } as unknown as Pool, log, connect };
}
// The digest each transaction installed straight after BEGIN, or undefined when a transaction ran without one.
function transactionDigests(log: Statement[]) {
 const digests: (string | undefined)[] = [];
 log.forEach((statement, index) => {
  if (statement.sql !== "BEGIN") return;
  const next = log[index + 1];
  digests.push(next?.sql.includes("app.practice_material_digest") ? String(next.values?.[0]) : undefined);
 });
 return digests;
}
// Authorisation is stubbed to derive the principal's digest from the session token it was asked about.
function authorizeBySession() {
 return vi.spyOn(PracticeAccess.prototype, "job").mockImplementation(async function (this: unknown) {
  return { digest: sha256(String((this as { sessionId?: string }).sessionId)), context: { tenantId: randomUUID() }, membershipId: randomUUID(), identityUserId: randomUUID() } as never;
 });
}
// Each stubbed repository method opens one transaction on the pool it was built with, exactly as withTenant does.
function openOneTransaction(affected: string) {
 const open = async (repository: unknown) => { const client = await (repository as { pool: Pool }).pool.connect(); await client.query("BEGIN"); await client.query("COMMIT"); client.release(); };
 vi.spyOn(RecoveryCaseRepository.prototype, "command").mockImplementation(async function (this: unknown) { await open(this); return { id: affected } as never; });
 vi.spyOn(RecoveryCaseRepository.prototype, "eligibilityCommand").mockImplementation(async function (this: unknown) { await open(this); return { id: affected } as never; });
 vi.spyOn(RecoveryCaseRepository.prototype, "listForMember").mockImplementation(async function (this: unknown) { await open(this); return [{ id: affected }] as never; });
}
const openBody = () => ({ version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType: "merchant_overcharge", claimedNetPence: 32000, counterparty: "Fictional merchant", book: "supplier_cost", sourceType: "supplier_documents", sourceRefs: [randomUUID()], expectedRevision: 0 });

it("repair 20: list, command and eligibility run every transaction, reply reads included, under the authorised session's digest", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 authorizeBySession();
 openOneTransaction(randomUUID());
 const owner = randomUUID(), other = randomUUID();
 for (const [name, run, transactions] of [
  ["list", (app: RecoveryCaseApplication) => app.list(randomUUID()), 1],
  ["command and its reply read", (app: RecoveryCaseApplication) => app.command(randomUUID(), openBody()), 2],
  ["command with a deferred body reader", (app: RecoveryCaseApplication) => app.command(randomUUID(), async () => openBody()), 2],
  ["eligibility and its reply read", (app: RecoveryCaseApplication) => app.eligibility(randomUUID(), command()), 2],
 ] as const) {
  const { pool, log } = recordingPool();
  await run(new RecoveryCaseApplication(pool, owner));
  expect(transactionDigests(log), name).toEqual(Array(transactions).fill(sha256(owner)));
 }
 // The explicit eligibility session override supplies the digest, not the constructor's session.
 const { pool, log } = recordingPool();
 await new RecoveryCaseApplication(pool, other).eligibility(randomUUID(), command(), owner);
 expect(transactionDigests(log)).toEqual([sha256(owner), sha256(owner)]);
});
it("repair 20: a refused target answers the same 404 and never opens a repository transaction or reads the body", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
 openOneTransaction(randomUUID());
 const { pool, connect } = recordingPool(), readBody = vi.fn(async () => openBody());
 const app = new RecoveryCaseApplication(pool, randomUUID());
 // Another session's job and a job that does not exist both fail identically at authorisation.
 for (const target of [randomUUID(), randomUUID()]) {
  for (const run of [() => app.list(target), () => app.command(target, readBody), () => app.eligibility(target, readBody)]) {
   const error = await run().catch(cause => cause), json = vi.fn(), status = vi.fn(() => ({ json }));
   expect(error).toMatchObject({ code: "NOT_FOUND", message: "NOT_FOUND" });
   new PracticeErrorsFilter().catch(error, { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as never);
   expect(status).toHaveBeenCalledWith(404);
   expect(json).toHaveBeenCalledWith({ code: "NOT_FOUND" });
  }
 }
 expect(connect).not.toHaveBeenCalled();
 expect(readBody).not.toHaveBeenCalled();
});
it("repair 20: an authorised body that cannot be parsed is a 400 refusal before any repository transaction", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 authorizeBySession();
 openOneTransaction(randomUUID());
 const { pool, connect } = recordingPool();
 const error = await new RecoveryCaseApplication(pool, randomUUID()).command(randomUUID(), async () => { throw new SyntaxError("Synthetic malformed JSON"); }).catch(cause => cause);
 expect(recoveryCommandFailure(error)).toEqual({ status: 400, body: { code: "INVALID_COMMAND" } });
 expect(connect).not.toHaveBeenCalled();
});
