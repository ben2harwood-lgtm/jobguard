import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const spies = vi.hoisted(() => ({ token: "11111111-1111-4111-8111-111111111111" as string | undefined, command: vi.fn(), eligibilityCommand: vi.fn(), list: vi.fn(), app: undefined as unknown }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => spies.token ? { value: spies.token } : undefined }) }));
// Load the real hasSyntheticSession/practiceFailure functions with infrastructure adapters.
vi.mock("./synthetic-server", async () => {
 const {readFileSync}=await import("node:fs"),{runInNewContext}=await import("node:vm"),{transpileModule,ModuleKind}=await import("typescript");
 const {resolve}=await import("node:path");
 const db=await import("@jobguard/db"), exports:Record<string,unknown>={};
 const adapters:Record<string,unknown>={"server-only":{},"next/headers":{},"next/server":{NextResponse:{json:Response.json}},"@jobguard/db":db,"@jobguard/api/workspace":{},"pg":{}};
 const js=transpileModule(readFileSync(resolve("app/lib/synthetic-server.ts"),"utf8"),{compilerOptions:{module:ModuleKind.CommonJS}}).outputText;
 runInNewContext(js,{exports,require:(id:string)=>adapters[id],Response,globalThis});
 return exports;
});
vi.mock("./workspace-server", () => ({ workspaceApplication: () => ({ recoveryCases: spies.app }) }));
vi.mock("@jobguard/db", async original => ({
 ...await original<typeof import("@jobguard/db")>(), readSyntheticDemoJob: vi.fn().mockResolvedValue({}),
 RecoveryCaseRepository: class { command = spies.command; eligibilityCommand = spies.eligibilityCommand; list = spies.list; listForMember = spies.list; },
}));
import { PracticeAccess } from "../../../api/src/practice-access";
import { RecoveryCaseApplication } from "../../../api/src/recovery-case.application";
import { GET as listGet, POST as commandPost } from "../api/jobs/[id]/recovery-cases/route";
import { POST as eligibilityPost } from "../api/jobs/[id]/recovery-cases/eligibility/route";
import { commandOutcome } from "./recovery-case-requests";
const jobId = randomUUID(), caseId = randomUUID();
const caseView = {
 id:caseId,jobId,caseType:"withheld_customer_payment",state:"identified",claimedNetPence:32000,landedNetPence:0,outstandingNetPence:32000,writtenOffPence:0,currency:"GBP",
 counterparty:"Fictional Customer",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:["Generated customer invoice INV-18800"],
 sources:[{ref:"Generated customer invoice INV-18800",kind:"Customer invoice",label:"Generated customer invoice INV-18800",recorded:false}],
 feeJobLiabilityPence:0,feeObligationsPostedPence:0,feeCompensationsPostedPence:0,approvedLandedNetPence:0,revision:1,reviewerRef:"membership:fictional",createdDate:"2026-10-05",eligibility:null,
};
afterEach(() => {vi.restoreAllMocks();vi.unstubAllEnvs()});
const opening = () => ({ version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType: "withheld_customer_payment", claimedNetPence: 32000, counterparty: "Fictional Customer", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"], expectedRevision: 0 });
const review = () => ({ version: "recovery-eligibility-command.v1", action: "review", commandId: randomUUID(), caseId, expectedCaseRevision: 1, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1, scenario: "evidence_backed_withheld_payment" });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); spies.token=randomUUID(); vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue({context:{tenantId:randomUUID()},membershipId:randomUUID(),identityUserId:randomUUID()} as never); spies.app = new RecoveryCaseApplication({} as Pool, spies.token); });
it.each([
 ["opening", commandPost, opening, spies.command],
 ["eligibility", eligibilityPost, review, spies.eligibilityCommand],
] as const)("%s: a committed command with a failed answer is unknown, and the same id replays one effect", async (_name, post, input, persist) => {
 // Fault injection at the application read AFTER the repository committed. This models replay; real PostgreSQL coverage is in the workbench integration suite.
 const effects = new Map<string, { id: string }>();
 persist.mockImplementation(async (_context, _job, body) => { if (!effects.has(body.commandId)) effects.set(body.commandId, { id: caseId }); return effects.get(body.commandId); });
 // Even a refusal-looking error during answer construction cannot change the already committed outcome.
 spies.list.mockRejectedValueOnce(new Error("RECOVERY_STALE_REVISION")).mockResolvedValue([caseView]);
 const body = input(), params = { params: Promise.resolve({ id: jobId }) };
 const send = () => post(new Request("https://sandbox.invalid/api", { method: "POST", body: JSON.stringify(body) }), params);
 const first = await send();
 expect(first.status).toBe(503);
 const answer = await first.json();
 expect(answer).toMatchObject({ version: "recovery-command-error.v1", code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN", outcome: "unknown" });
 expect(commandOutcome({ status: first.status, body: answer }).kind).toBe("unknown");
 const retry = await send();
 expect(retry.status).toBe(200);
 const retriedAnswer=await retry.json();
 expect(retriedAnswer).toMatchObject({ affectedCaseId: caseId, cases: [{ id: caseId }] });
 expect(commandOutcome({status:retry.status,body:retriedAnswer}).kind).toBe("saved");
 expect(persist.mock.calls.map(call => call[2].commandId)).toEqual([body.commandId, body.commandId]);
 expect(effects.size).toBe(1);
});
it.each([commandPost, eligibilityPost])("unexpected write/commit failures are unknown rather than refused", async post => {
 spies.command.mockRejectedValue(new Error("connection closed during COMMIT"));
 spies.eligibilityCommand.mockRejectedValue(new Error("connection closed during COMMIT"));
 const result = await post(new Request("https://sandbox.invalid/api", { method: "POST", body: JSON.stringify(post === commandPost ? opening() : review()) }), { params: Promise.resolve({ id: jobId }) });
 expect(result.status).toBe(503);
 expect(await result.json()).toMatchObject({ code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN", outcome: "unknown" });
});
it.each([commandPost, eligibilityPost])("malformed request JSON is an established pre-commit refusal", async post => {
 const result = await post(new Request("https://sandbox.invalid/api", { method: "POST", body: "{" }), { params: Promise.resolve({ id: jobId }) });
 expect(result.status).toBe(400);
 expect(spies.command).not.toHaveBeenCalled();
 expect(spies.eligibilityCommand).not.toHaveBeenCalled();
});
it.each([["MEMBERSHIP_FORBIDDEN", 403], ["JOB_NOT_FOUND", 404]] as const)("a read refused with %s answers %i, not a malformed-request 400 (Codex P2)", async (code, status) => {
 spies.list.mockRejectedValue(Object.assign(new Error(code), { code }));
 const response = await listGet(new Request(`http://jobguard.test/api/jobs/${jobId}/recovery-cases`), { params: Promise.resolve({ id: jobId }) });
 expect(response.status).toBe(status);
 expect(await response.json()).toEqual({ code });
});

it.each([
 ["list",listGet,undefined], ["open",commandPost,{action:"open"}], ["amend_claim",commandPost,{action:"amend_claim"}],
 ...["assemble_evidence","start_pursuit","start_negotiation","resume_pursuit","record_landing","close_recovered","close_no_recovery","write_off","dispute","reverse_landing","prevent"].map(event=>[event,commandPost,{action:"transition",eventType:event}] as const),
 ...["review","approve","supersede"].map(action=>[`eligibility ${action}`,eligibilityPost,{action}] as const),
] as const)("%s: actual Next route/application deny missing sessions with 401 and strangers/nonexistent jobs with identical 404s",async(_name,route,body)=>{
 vi.restoreAllMocks();
 for(const scenario of ["missing","stranger","nonexistent"]){
  spies.token=scenario==="missing"?undefined:randomUUID();
  const query=vi.fn(async(sql:string)=>({rows:scenario!=="missing"&&sql.includes("authenticate_practice_session")?[{tenant_id:randomUUID(),membership_id:randomUUID(),identity_user_id:randomUUID()}]:[]}));
  const connect=vi.fn(async()=>({query,release:vi.fn()}));
  spies.app=new RecoveryCaseApplication({query,connect} as unknown as Pool,spies.token);
  const response=await route(new Request("https://sandbox.invalid/api",body?{method:"POST",body:JSON.stringify(body)}:undefined),{params:Promise.resolve({id:randomUUID()})});
  expect(response.status).toBe(scenario==="missing"?401:404);
  expect(await response.json()).toEqual({code:scenario==="missing"?"UNAUTHENTICATED":"NOT_FOUND"});
  if(scenario!=="missing")expect(response.headers.get("cache-control")).toBe("no-store");
  expect(spies.command).not.toHaveBeenCalled();expect(spies.eligibilityCommand).not.toHaveBeenCalled();expect(spies.list).not.toHaveBeenCalled();
  if(scenario==="missing"){expect(query).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled()}
 }
});
