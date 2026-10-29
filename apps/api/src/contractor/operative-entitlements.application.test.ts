import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { ContractorEntitlementAuthorityRepository, ContractorRepository, SiteExtraRepository, type AuthenticatedMembership } from "@jobguard/db";
import { ContractorError } from "@jobguard/core";
import { ContractorApplication, contractorHttpStatus } from "./contractor.application.js";
import { SiteExtraApplication, siteExtraHttpFailure, sorSiteExtraHttpFailure } from "./site-extra.application.js";
const sessionId=randomUUID(),tenantId=randomUUID(),membershipId=randomUUID(),identityUserId=randomUUID();
const member={tenantId,membershipId,identityUserId} as AuthenticatedMembership;
const authority=(track="contractor",status:string|null="active")=>({version:"contractor-entitlement-authority.v1",environment:"synthetic_demo",tenantId,membershipId,identityUserId,
 assignment:{id:randomUUID(),revision:1,track,agreementReference:`synthetic-agreement:${randomUUID()}`},status:status===null?null:{id:randomUUID(),revision:1,status}});
const principal={version:"contractor-principal.v1",sessionId};
const invite=()=>({version:"contractor-command.v1",environment:"synthetic_demo",commandId:randomUUID(),id:randomUUID(),expectedRevision:0,kind:"member.invite",role:"operative",email:"worker@fictional.invalid",scope:{kind:"tenant",id:tenantId},clientId:null,contractId:null});
const body=()=>({version:"log-site-extra.v1",commandId:randomUUID(),description:"Fictional extra",note:"Fictional note"});
let pool:Pool;
beforeEach(()=>{vi.stubEnv("JOBGUARD_ENV","synthetic_demo");pool=new Pool();});
afterEach(async()=>{await pool.end();vi.restoreAllMocks();vi.unstubAllEnvs();});
function facts(value:ReturnType<typeof authority>){
 return vi.spyOn(ContractorEntitlementAuthorityRepository.prototype,"withAuthority").mockImplementation(async(session,consume)=>{expect(session).toBe(sessionId);return consume(undefined as never,value as never);});
}
it.each([["small_builder","active"],["contractor","inactive"],["contractor","suspended"],["contractor",null]])("route refuses operative grants and both site captures for %s / %s before the writer",async(track,status)=>{
 facts(authority(track!,status));vi.spyOn(ContractorRepository.prototype,"resolveSession").mockResolvedValue(member);
 const command=vi.spyOn(ContractorRepository.prototype,"command"),log=vi.spyOn(SiteExtraRepository.prototype,"logSiteExtra"),sor=vi.spyOn(SiteExtraRepository.prototype,"logSorSiteExtra");
 const contractor=new ContractorApplication(pool),site=new SiteExtraApplication(pool),raw=invite();
 const grant={version:raw.version,environment:raw.environment,commandId:randomUUID(),id:randomUUID(),expectedRevision:0,kind:"grant.create",membershipId,role:"operative",scope:raw.scope,contractId:null};
 for(const input of [raw,grant])await expect(contractor.command(principal,input)).rejects.toMatchObject({code:"FORBIDDEN"});
 await expect(site.log(principal,randomUUID(),body())).rejects.toMatchObject({code:"EXTRA_FORBIDDEN"});
 await expect(site.logSor(principal,randomUUID(),{version:"log-sor-site-extra.v1",commandId:randomUUID(),sorCode:"CLEAR-GUTTER",quantity:"1",note:"Fictional"})).rejects.toMatchObject({code:"EXTRA_FORBIDDEN"});
 expect(command).not.toHaveBeenCalled();expect(log).not.toHaveBeenCalled();expect(sor).not.toHaveBeenCalled();
});
it("active server agreement admits an operative command; later suspension refuses its replay",async()=>{
 const current=authority();facts(current);vi.spyOn(ContractorRepository.prototype,"resolveSession").mockResolvedValue(member);
 const writer=vi.spyOn(ContractorRepository.prototype,"command").mockResolvedValue({id:randomUUID(),revision:1,kind:"member.invite",environment:"synthetic_demo",realExternalActions:0});
 const app=new ContractorApplication(pool),raw=invite();await app.command(principal,raw);expect(writer).toHaveBeenCalledExactlyOnceWith(member,raw);
 current.status!.status="suspended";await expect(app.command(principal,raw)).rejects.toMatchObject({code:"FORBIDDEN"});expect(writer).toHaveBeenCalledOnce();
});
it.each(["contractorAgreementActive","plan","track","enabled","tenantId"])("forged client %s is refused by strict boundaries",async key=>{
 const port=vi.spyOn(ContractorEntitlementAuthorityRepository.prototype,"withAuthority"),writer=vi.spyOn(ContractorRepository.prototype,"command");vi.spyOn(ContractorRepository.prototype,"resolveSession").mockResolvedValue(member);
 await expect(new ContractorApplication(pool).command(principal,{...invite(),[key]:true})).rejects.toMatchObject({code:"INVALID_COMMAND"});
 await expect(new SiteExtraApplication(pool).log(principal,randomUUID(),{...body(),[key]:true})).rejects.toMatchObject({code:"INVALID_COMMAND"});expect(port).not.toHaveBeenCalled();expect(writer).not.toHaveBeenCalled();
});
it("denial responses expose only public codes without agreement or shadow facts",()=>{
 const error=Object.assign(new Error("private agreement or shadow detail"),{code:"FORBIDDEN"});expect(contractorHttpStatus(new ContractorError("FORBIDDEN"))).toBe(403);
 expect(JSON.stringify(siteExtraHttpFailure(error))).not.toContain("private");expect(JSON.stringify(sorSiteExtraHttpFailure(error))).not.toContain("private");
});
