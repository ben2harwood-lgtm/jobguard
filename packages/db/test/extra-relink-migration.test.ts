import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadMigrationProofs } from "./migration-proof-loader.js";
const sql = readFileSync(new URL("../migrations/0966_extra_duplicate_relink.sql",import.meta.url),"utf8");
const previous = readFileSync(new URL("../migrations/0522_lp5b_writers.sql",import.meta.url),"utf8");
const body = (source:string,name:string) => source.split(`CREATE OR REPLACE FUNCTION app.${name}`)[1]!.split("AS $$")[1]!.split("$$;")[0]!;
it("0966 preserves the latest mark command, including authority and the LP5 effect binding", () => {
 const comment = " -- Read the effective state: an explicitly reversed duplicate fact no longer masks the prior state.\n";
 expect(body(sql,"xa_mark_duplicate").replace(comment,"")).toBe(body(previous,"xa_mark_duplicate"));
 expect(sql).not.toMatch(/ALTER TABLE|SET app\./i);
});
it("0966 pins the private state projection to its exact PostgreSQL 16 definition", () => {
 const source = body(sql,"xa_latest_kind");
 const definition = `CREATE OR REPLACE FUNCTION app.xa_latest_kind(p_tenant uuid, p_job uuid, p_variation uuid)\n RETURNS text\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_catalog'\nAS $function$${source}$function$\n`;
 const proof = loadMigrationProofs().proofs.find(x=>x.migration==="0966_extra_duplicate_relink.sql")!;
 expect(proof.lp0).toHaveLength(1);
 expect(proof.lp0[0]!.after).toMatchObject({identity:"function:app.xa_latest_kind(uuid,uuid,uuid)",
  definitionSha256:createHash("sha256").update(definition).digest("hex"),runtimeExecute:false,securityDefiner:false});
 expect(proof.upgrade).toEqual([]); expect(proof.tenancy).toEqual([]);
});
