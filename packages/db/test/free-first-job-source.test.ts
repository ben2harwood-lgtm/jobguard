import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe,it,expect } from "vitest";
import { parseInventory,repoFileExists } from "./lp-0-catalog.js";
describe('MON-3 source-only inventory gate',()=>{
 it('keeps the combined inventory valid and classifies every new runtime capability',async()=>{
  const raw=JSON.parse(await readFile(new URL('../../../docs/contracts/lp-0-effective-privileges-v1.json',import.meta.url),'utf8'));
  const inventory=parseInventory(raw);
  // Global completeness remains the existing LP-0 CI gate. This task checks
  // its own addition without changing any inherited source references.
  const group=inventory.groups.find(group=>group.id==='a-mon3c-lifecycle')!;
  for(const file of [...group.sources,...group.tests])expect(repoFileExists(file.split(':')[0]!)).toBe(true);
  for(const name of ['mon3_activate(uuid,text,uuid,jsonb)','mon3_simulate_card(uuid,text,uuid,jsonb)','mon3_read_lifecycle(uuid,text,uuid)']){
   const entry=inventory.entries.find(entry=>entry.key===`acl|routine|function:app.${name}|jobguard_runtime|EXECUTE|-`);
   expect(entry?.group).toBe('a-mon3c-lifecycle');
  }
 });
});

// Merge catch-up regression: retain both the trial lane and current-main surfaces.
it('retains trial, OIDC and value controllers plus captured-job diary and messages',async()=>{
 const module=await readFile(new URL('../../../apps/api/src/app.module.ts',import.meta.url),'utf8');
 for(const controller of ['FreeFirstJobLifecycleController','OidcController','SuccessFeeController','BusinessValueController','ValueV3Controller'])
  expect(module).toMatch(new RegExp(`controllers: \\[.*\\b${controller}\\b`));
 const shell=await readFile(new URL('../../../apps/web/app/ui/workspace-shell.tsx',import.meta.url),'utf8');
 const capture=shell.slice(shell.indexOf('if(capture)return'),shell.indexOf('if(!job)return'));
 for(const control of ['First job trial and card','<JobDiary ','<CustomerMessages '])expect(capture).toContain(control);
 const exports=await readFile(new URL('../src/index.ts',import.meta.url),'utf8');
 for(const path of ['free-first-job-lifecycle-repository','stored-receipt-case-allocation-repository','receipt-line-allocation-repository','evidence-pack-v3-repository'])expect(exports).toContain(`./${path}.js`);
 expect(exports.match(/export \{ ContractorRetainedReadRepository \}/g)).toHaveLength(1);
 const upgrade=await readFile(new URL('./serious-b5-upgrade.integration.test.ts',import.meta.url),'utf8');
 for(const kind of ['rows','routines','relations','policies']){
  expect(upgrade).toContain(`...admission.${kind}`);
  expect(upgrade).toContain(`...enterpriseReconciliation.${kind}`);
 }
 expect(upgrade).toContain('...eligibility');
});

it('preserves the reviewed SQL bytes at reserved migration numbers',async()=>{
 const admission=await readFile(new URL("../migrations/0372_free_first_job_admission.sql",import.meta.url));
 expect(createHash("sha256").update(admission).digest("hex")).toBe("c9243b5c64a557efd143e7bf9693fdde7e1b14f5a36556d4fd094c555e3309f8");
 const eligibility=await readFile(new URL("../migrations/0373_free_first_job_eligibility.sql",import.meta.url));
 expect(createHash("sha256").update(eligibility).digest("hex")).toBe("bc00155d4d51a21974eb0a10b8c201a340f8863122bb49d47490c166d9dc6bc2");
});
