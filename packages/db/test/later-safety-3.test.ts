// Source/transport checks only. PostgreSQL races and privileges are exercised by integration suites in CI.
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { VerifiedTenantContext } from "../src/tenant-context.js";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { loadReviewedInventory } from "./lp-0-catalog.js";
import { CaptureRepository } from "../src/capture-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const sql = (name: string) => { const url = new URL(`../migrations/${name}.sql`, import.meta.url); return existsSync(url) ? readFileSync(url,"utf8") : ""; };
afterEach(()=>vi.unstubAllEnvs());
it("company import duplicate guard is tenant/source scoped under the existing transaction lock",()=>{
 const source=sql("0778_company_import_once");
 expect(source).toContain("pg_advisory_xact_lock(hashtextextended(t::text,184))");
 expect(source).toContain("(t<>'11111111-1111-4111-8111-111111111111'::uuid OR session_digest=d)");
 expect(source).toContain("ON app.job_import_v3(tenant_id,source_job_id)");
});
it("raw AIS reads are explicitly revoked for all four tables",()=>{
 const source=sql("0779_ais_private_reads");
 for(const table of ["ais_connection","ais_lifecycle","ais_observation","ais_page"])
  expect(source).toContain(`REVOKE SELECT ON app.${table} FROM jobguard_runtime;`);
});
it("billability approval identity is unique independently of command and review IDs",()=>{
 const source=sql("0780_billability_one_line");
 expect(source).toContain("CREATE UNIQUE INDEX billability_one_line_approval");
 expect(source).toContain("tenant_id,job_id,case_id,(payload->>'workId'),(payload->>'lineId')");
 expect(source).toContain("WHERE action='approve'");
});
it.each(["production","pilot_no_charge","unconfigured",""])("persistence refuses %s before connecting or parsing",async mode=>{
 vi.stubEnv("JOBGUARD_ENV",mode);
 const connect=vi.fn();
 await expect(new CaptureRepository({connect} as unknown as Pool).persistSpeechFixtureSource(testTenantContext(randomUUID()),randomUUID(),{}))
  .rejects.toThrow("SPEECH_FIXTURE_DARK_ONLY");
 expect(connect).not.toHaveBeenCalled();
});
function speechSource(){return {kind:"deepgram_transcript",text:"Shelf",acquisition:{contractVersion:"deepgram_fixture_transcript_v1",environment:"synthetic_demo",provider:"deepgram_fixture",
 deployment:"deepgram-fixture.invalid",model:"fixture-stt-v1",schemaVersion:"deepgram_fixture_response_v1",evaluationVersion:"deepgram-fixture-contract-v1",fixtureId:"shelf",evidenceId:randomUUID(),evidenceJobId:randomUUID(),objectVersionId:"v1",sourceSha256:"a".repeat(64),audioByteLength:46,originalText:"Original",rawTranscript:"Shelf",status:"complete",humanEdited:false}};}
it("persistence refuses a forged tenant context before connecting",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo"); const connect=vi.fn();
 await expect(new CaptureRepository({connect} as unknown as Pool).persistSpeechFixtureSource({tenantId:randomUUID()} as VerifiedTenantContext,randomUUID(),speechSource())).rejects.toMatchObject({code:"INVALID_TENANT_CONTEXT"});
 expect(connect).not.toHaveBeenCalled();
});
it("persistence refuses a non-demo database before consulting or writing evidence",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const query=vi.fn(async(sql:string)=>({rows:sql.includes("current_database()")?[{database:"postgres"}]:[]}));
 const pool={connect:async()=>({query,release:vi.fn()})} as unknown as Pool;
 const raw=speechSource();
 await expect(new CaptureRepository(pool).persistSpeechFixtureSource(testTenantContext(randomUUID()),randomUUID(),raw)).rejects.toThrow("SPEECH_FIXTURE_DARK_ONLY");
 expect(query.mock.calls.some(([sql])=>sql.includes("app.evidence_object")||sql.includes("INSERT"))).toBe(false);
});

it("the complete proof chain removes only direct AIS access and retains the checked routine",async()=>{
 const {inventory}=await loadReviewedInventory();
 for(const table of ["ais_connection","ais_lifecycle","ais_observation","ais_page"]){
  expect(inventory.entries.some(e=>e.key===`acl|rel|table|app.${table}|jobguard_runtime|SELECT|-`)).toBe(false);
  expect(inventory.entries.some(e=>e.key===`owner|rel:table|app.${table}|jobguard_migration`)).toBe(false);
  expect(inventory.recorded.rls.some(r=>r.startsWith(`app.${table}|`))).toBe(false);
 }
 expect(inventory.entries.some(e=>e.key==="acl|routine|function:app.dark_ais(uuid,text,uuid,text,jsonb)|jobguard_runtime|EXECUTE|-")).toBe(true);
});
