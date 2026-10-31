import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lp3CanonicalInput, lp3PayloadHash } from "../src/lp3-operation.js";
import { lp3CatalogDatabase, lp3NewSignatures, lp3OldSignatures } from "./lp3-catalog-fixtures.js";

// Reused catalogue/codec assertions from the earlier LP-3 start; actual migrated schema.
describe("LP-3 codec and actual-role catalogue enforcement", () => {
  let database: Awaited<ReturnType<typeof lp3CatalogDatabase>>;
  beforeAll(async () => { database = await lp3CatalogDatabase(); }, 300_000);
  afterAll(async () => { await database?.close(); });

  it("LP3-A01 PostgreSQL and TypeScript encode UTF-8 tokens identically (codec only)", async () => {
    const tenantId = "11111111-1111-4111-8111-111111111111";
    const actorMembershipId = "22222222-2222-4222-8222-222222222222";
    const jobId = "33333333-3333-4333-8333-333333333333";
    const documentId = "44444444-4444-4444-8444-444444444444";
    for (const statedCustomerName of ["Fictional 🧱 Café", "Fictional Cafe\u0301", 'Fictional :\n"customer"']) {
      for (const evidenceId of [null, "55555555-5555-4555-8555-555555555555"]) {
        for (const acceptedAt of ["2026-10-16T12:34:56.123Z", "2024-02-29T00:00:00.000Z"]) {
          const input = { version: "lp3-input.v1", operation: "quote.acceptance.attest", tenantId,
            actorMembershipId, jobId, documentId, documentVersion: 1, documentHash: "a".repeat(64),
            expectedJobRevision: 0, acceptedTotalPence: 1_000_000_000_000, currency: "GBP",
            statedCustomerName, statedMethod: "email", acceptedAt, evidenceId, policyVersion: "builder-attestation.v1" };
          // SQL reads named validated inputs, not TypeScript's token list or digest.
          const result = (await database.runtime.query<{ canonical: string; hash: string }>(`
            WITH input AS (SELECT $1::jsonb value), tokens AS (
              SELECT token,ordinal FROM input,unnest(ARRAY[
                value->>'version',value->>'operation',value->>'tenantId',value->>'actorMembershipId',value->>'jobId',
                value->>'documentId',(value->>'documentVersion')::integer::text,value->>'documentHash',
                (value->>'expectedJobRevision')::integer::text,(value->>'acceptedTotalPence')::bigint::text,
                value->>'currency',value->>'statedCustomerName',value->>'statedMethod',
                to_char((value->>'acceptedAt')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                value->>'evidenceId',value->>'policyVersion'
              ]) WITH ORDINALITY AS t(token,ordinal)
            ), encoded AS (
              SELECT string_agg(CASE WHEN token IS NULL THEN '-1:'
                ELSE octet_length(convert_to(token,'UTF8'))::text||':'||token END,'' ORDER BY ordinal) canonical FROM tokens
            ) SELECT canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex') hash FROM encoded`, [JSON.stringify(input)])).rows[0]!;
          expect(result.canonical).toBe(lp3CanonicalInput(input));
          expect(result.hash).toBe(lp3PayloadHash(input));
        }
      }
    }
  });

  it("LP3-A20 side-table access is least privilege (catalogue preparation)", async () => {
    const table = (await database.runtime.query(`SELECT c.relrowsecurity,c.relforcerowsecurity,r.rolname owner
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
      WHERE c.oid=to_regclass('app.activation_acceptance_operation_use')`)).rows;
    expect(table).toEqual([{ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration" }]);
    const privileges = (await database.runtime.query(`SELECT
      has_table_privilege(current_user,'app.activation_acceptance_operation_use','SELECT') readable,
      has_table_privilege(current_user,'app.activation_acceptance_operation_use','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') writable,
      has_schema_privilege(current_user,'app','CREATE') ddl,
      pg_has_role(current_user,'jobguard_migration','MEMBER') owner_member`)).rows[0];
    expect(privileges).toEqual({ readable: true, writable: false, ddl: false, owner_member: false });
    const client = await database.runtime.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", ["11111111-1111-4111-8111-111111111111"]);
      expect((await client.query("SELECT * FROM app.activation_acceptance_operation_use")).rows).toEqual([]);
      for (const statement of [
        "INSERT INTO app.activation_acceptance_operation_use DEFAULT VALUES",
        "UPDATE app.activation_acceptance_operation_use SET recorded_at=recorded_at",
        "DELETE FROM app.activation_acceptance_operation_use",
        "TRUNCATE app.activation_acceptance_operation_use",
        "ALTER TABLE app.activation_acceptance_operation_use ADD COLUMN forbidden integer",
        "SET ROLE jobguard_migration",
      ]) {
        await client.query("SAVEPOINT refusal");
        await expect(client.query(statement)).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK TO SAVEPOINT refusal");
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("LP3-A21 old executable doors are withdrawn (actual inherited login)", async () => {
    expect((await database.runtime.query("SELECT current_user")).rows[0]?.current_user).toBe("lp2_login");
    for (const signature of lp3OldSignatures) {
      const routine = (await database.runtime.query(`SELECT to_regprocedure($1)::oid id,
        has_function_privilege(current_user,to_regprocedure($1),'EXECUTE') allowed`, [signature])).rows[0]!;
      expect(routine.id, signature).not.toBeNull(); // retained for owner history setup
      expect(routine.allowed, signature).toBe(false);
      const argumentsCount = signature.slice(signature.indexOf("(") + 1, -1).split(",").length;
      // Explicit casts resolve the exact signature, including char and varchar.
      const types = signature.slice(signature.indexOf("(") + 1, -1).split(",");
      const call = signature.slice(0, signature.indexOf("(")) + "(" + types.map(type => `NULL::${type}`).join(",") + ")";
      expect(types).toHaveLength(argumentsCount);
      await expect(database.runtime.query(`SELECT ${call}`)).rejects.toMatchObject({ code: "42501" });
    }
    for (const signature of lp3NewSignatures) {
      const routine = (await database.runtime.query(`SELECT to_regprocedure($1)::oid id,
        has_function_privilege(current_user,to_regprocedure($1),'EXECUTE') allowed`, [signature])).rows[0]!;
      expect(routine.id, signature).not.toBeNull();
      expect(routine.allowed, signature).toBe(true);
    }
  });

  it("dark routes reject an ordinary database before reading supplied authority", async () => {
    for (const signature of lp3NewSignatures) {
      const types=signature.slice(signature.indexOf("(")+1,-1).split(",");
      const call=signature.slice(0,signature.indexOf("("))+"("+types.map(type=>`NULL::${type}`).join(",")+")";
      await expect(database.runtime.query(`SELECT ${call}`)).rejects.toMatchObject({code:"42501",message:"LP3_SYNTHETIC_DATABASE_REQUIRED"});
    }
  });

  it("LP3-A22 checked overloads declare trusted paths and no omitted security arguments (catalogue preparation)", async () => {
    for (const signature of lp3NewSignatures) {
      const rows = (await database.runtime.query(`SELECT p.prosecdef,p.pronargdefaults,p.proconfig,r.rolname owner,
        EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute
        FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
        WHERE p.oid=to_regprocedure($1)`, [signature])).rows;
      expect(rows, signature).toHaveLength(1);
      expect(rows[0]).toMatchObject({ prosecdef: true, pronargdefaults: 0, owner: "jobguard_migration", public_execute: false });
      // pg_temp last prevents implicit temporary-relation lookup before trusted schemas.
      expect(rows[0].proconfig).toContain("search_path=pg_catalog, app, pg_temp");
    }
  });
});
