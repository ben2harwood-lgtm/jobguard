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
