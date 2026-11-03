import {createHash,randomUUID} from "node:crypto";
import {expect,it,vi} from "vitest";
import {decodeFinalCheckSourceFixture} from "./job-source-fixtures.js";
import {detectShadowObservations,groupShadowProposals,observationV1} from "@jobguard/core";
import {importLateSource} from "./late-source-import.js";
it("J uses the existing one-work coalescer for the exact email, message and photo fixtures",()=>{
 const tenantId=randomUUID(),jobId=randomUUID(),sha256=createHash("sha256").update("Outside tap fitted").digest("hex");
 const observations=["email","message","completion_photo"].map(kind=>observationV1.parse({version:"observation.v1",tenantId,jobId,
  kind:kind==="completion_photo"?"completion_photo":"note_or_voice",evidence:{id:randomUUID(),objectVersionId:randomUUID(),sha256,serverReceivedAt:"2026-10-01T00:00:00Z"},...decodeFinalCheckSourceFixture(kind,sha256)}));
 const proposals=detectShadowObservations(observations,[],"2026-10-02T00:00:00Z"),groups=groupShadowProposals(proposals,observations,[]);
 expect(groups).toHaveLength(1);expect(groups[0]!.primary.evidence).toHaveLength(3);expect(groups[0]!.duplicates).toHaveLength(2);
 expect(decodeFinalCheckSourceFixture("email","a".repeat(64))).toBeNull();
 expect(decodeFinalCheckSourceFixture("unreviewed",sha256)).toBeNull();
});
it("rejects an unversioned or caller-backdated receive time before touching the pool",async()=>{
 const connect=vi.fn(),pool={connect} as never;
 await expect(importLateSource(pool,undefined as never,randomUUID(),"a".repeat(64),{serverReceivedAt:"2020-01-01"})).rejects.toThrow("INVALID_JOB_SOURCE_INPUT");
 expect(connect).not.toHaveBeenCalled();
});
