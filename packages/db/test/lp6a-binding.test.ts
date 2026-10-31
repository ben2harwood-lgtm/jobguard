import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadReviewedInventory, pathCompleteness, repoFileExists } from "./lp-0-catalog.js";

it("records the dark binding as an explicit authority path without broadening business grants",async()=>{
  const {inventory}=await loadReviewedInventory();
  expect(pathCompleteness(inventory,repoFileExists).filter(p=>p.includes("lp6a"))).toEqual([]);
  const entries=inventory.entries.filter(e=>e.group==="a-lp6a-request-binding");
  expect(entries).toHaveLength(18);
  const runtime=entries.filter(e=>e.key.includes("|jobguard_runtime|"));
  expect(runtime.map(e=>e.key).sort()).toEqual([
    "acl|routine|function:app.bind_request(p_kind text, p_credential text, p_tenant uuid)|jobguard_runtime|EXECUTE|-",
    "acl|routine|function:app.current_actor()|jobguard_runtime|EXECUTE|-",
    "acl|routine|function:app.current_tenant()|jobguard_runtime|EXECUTE|-",
  ]);
  for(const e of entries)expect(e.key).not.toMatch(/\|(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE)\|/);
  expect(entries.some(e=>e.key.startsWith("member|")||e.key.startsWith("reach|"))).toBe(false);
});

it("keeps SQL additions dark and credentials out of the binding store and error text",()=>{
  const sql=readFileSync(new URL("../migrations/0520_lp6a_request_binding.sql",import.meta.url),"utf8");
  expect(sql).not.toMatch(/CREATE OR REPLACE|CREATE POLICY|ALTER POLICY|ALTER TABLE app\./);
  const table=sql.slice(sql.indexOf("CREATE UNLOGGED TABLE"),sql.indexOf("ALTER TABLE control_plane.request_binding"));
  expect(table).not.toMatch(/token_digest|session_digest|p_credential|signature/);
  expect(sql).not.toMatch(/RAISE (?:NOTICE|LOG|DEBUG|INFO|WARNING)/);
  for(const error of sql.matchAll(/RAISE EXCEPTION '([^']+)'([^;]*);/g)) {
    expect(error[1]).not.toContain("%");
    expect(error[2]).toMatch(/^ USING ERRCODE='(?:42501|42704)'$/);
  }
  expect(sql).not.toMatch(/pg_advisory|FOR UPDATE|FOR KEY SHARE|pg_control_system|lp6_environment/);
  expect(sql).toContain("extract(epoch FROM pg_postmaster_start_time())");
});
