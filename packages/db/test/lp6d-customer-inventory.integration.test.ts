import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { cluster, chainWorld, submitted, approveInput, emailOf, newToken } from "./extra-approval-chain-fixtures.js";
import { ExtraApprovalRepository } from "../src/index.js";
import { testActorContext } from "./tenant-context-test-utils.js";

// RED, test only. No second customer binding kind. Scan installed definitions,
// not migration text: later CREATE OR REPLACE definitions must count.
const customerRole = "jobguard_identity";
const delegated = "identity.customer_portal_message(uuid, uuid, uuid, text, jsonb)";
const clientApproval = "identity.extra_customer_approval(uuid, uuid, uuid, text, jsonb)";
const allowlist: Record<string, string> = {
  "identity.customer_portal_issue(uuid, text, uuid, uuid, text, text)": "Sponsor-authenticated link issuance reaches no binding-guarded routine.",
  "identity.customer_portal_quote(uuid, uuid, uuid, text, jsonb)": "Exact authenticated quote read/acceptance reaches no binding-guarded routine.",
  "identity.customer_portal_revoke(uuid, text, uuid, uuid)": "Sponsor-authenticated revocation reaches no binding-guarded routine.",
  "identity.customer_portal_use(uuid, uuid, uuid, text, text, text)": "Scoped portal redeem/resolve/signout reaches no binding-guarded routine.",
  "identity.customer_practice_pay_now(uuid, uuid, uuid, text)": "Authenticated invoice-balance projection reaches no binding-guarded routine.",
  "identity.customer_stages(uuid, uuid, uuid, text, uuid, uuid, text)": "Authenticated stage read/acknowledgement reaches no binding-guarded routine.",
  "identity.customer_variation(uuid, uuid, uuid, text, jsonb)": "Exact authenticated variation read/approval reaches no binding-guarded routine.",
  [clientApproval]: "Scoped live-link reads/decisions must preserve main; LP-6c's unbound decision refusal currently fails the parity probe below (HOLD).",
};
type Routine = { oid: number; schema: string; name: string; signature: string; source: string; executable: boolean };
// Scan both raw source and source with comments removed: one retains calls
// after comment-like string contents, the other sees comments between a name
// and '('. Follow qualified/unqualified calls and every matching overload;
// ambiguous names deliberately overcount across application schemas.
// This is a source inventory, not a proof for computed SQL, triggers or RLS.
// New computed dispatch needs explicit review and a behavioural probe.
const uncomment = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/--[^\n]*/gu, " ");
async function inventory(db: PoolClient) {
  const routines = (await db.query<Routine>(`SELECT p.oid::int, n.nspname AS schema, p.proname AS name,
    n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS signature,
    CASE WHEN p.prosqlbody IS NULL THEN p.prosrc ELSE pg_get_functiondef(p.oid) END AS source,
    has_function_privilege($1,p.oid,'EXECUTE') AS executable
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp)'
      AND p.prokind IN ('f','p') ORDER BY 4`, [customerRole])).rows;
  const byName = new Map<string, Routine[]>();
  for (const routine of routines) byName.set(routine.name.toLowerCase(), [...(byName.get(routine.name.toLowerCase()) ?? []), routine]);
  const edges = new Map(routines.map(routine => [routine.oid,
    [routine.source, uncomment(routine.source)].flatMap(source => [...source.matchAll(/(?:"((?:[^"]|"")*)"|\b([a-z_][a-z_0-9$]*))\s*\(/giu)])
      .flatMap(call => byName.get((call[1]?.replaceAll('""', '"') ?? call[2]!).toLowerCase()) ?? []).map(callee => callee.oid)]));
  // Accessor sinks cover all current_actor/current_tenant callers in 0686/0687
  // and future wrappers, without freezing a stale list of money routine names.
  const guards = new Set(routines.filter(r => r.schema === "app" &&
    ["begin_command", "lp5_bind_effect", "complete_command", "current_actor", "current_tenant"].includes(r.name)).map(r => r.oid));
  expect(guards.size).toBeGreaterThanOrEqual(5);
  const reachesGuard = (root: Routine) => {
    const seen = new Set<number>(), pending = [root.oid];
    while (pending.length) {
      const oid = pending.pop()!;
      if (seen.has(oid)) continue;
      seen.add(oid);
      if (guards.has(oid)) return true;
      pending.push(...(edges.get(oid) ?? []));
    }
    return false;
  };
  return routines.filter(r => (r.schema === "identity" && r.name.startsWith("customer_")) || r.executable)
    .map(r => ({ ...r, guarded: reachesGuard(r) }));
}
async function assertInventory(db: PoolClient) {
  const roots = await inventory(db), message = roots.find(r => r.signature === delegated);
  expect(message, "installed customer message must be inventoried").toBeDefined();
  expect(message!.guarded).toBe(true);
  // Only credential resolution may precede the unconditional binder. Match the
  // declarations too, so an initializer cannot do business before BEGIN.
  expect(uncomment(message!.source).replace(/\s+/gu, " ").trim(), delegated).toMatch(
    /^DECLARE result jsonb; sid uuid; existed boolean; BEGIN PERFORM identity\.customer_portal_use\(t,j,c,digest,NULL,'resolve'\); PERFORM app\.lp6_bind_customer_portal\(t,j,c,digest\); /u);
  for (const routine of roots) {
    if (routine.signature === delegated) continue;
    const reason = allowlist[routine.signature];
    if (routine.guarded || (routine.schema === "identity" && routine.name.startsWith("customer_")))
      expect(reason, `Unreviewed customer routine: ${routine.signature}; guarded=${routine.guarded}`).toBeTruthy();
    if (reason && routine.signature !== clientApproval)
      expect(routine.guarded, `No-guard reason became stale: ${routine.signature}`).toBe(false);
  }
  for (const signature of Object.keys(allowlist))
    expect(roots.some(r => r.signature === signature), `Stale allowlist: ${signature}`).toBe(true);
  // Each guarded exception must have a live behavioural probe below.
  expect(roots.filter(r => r.guarded && r.signature !== delegated).map(r => r.signature)).toEqual([clientApproval]);
  return roots;
}
let f: WorkFixture;
beforeAll(async () => {
  f = await createWorkFixture(false);
  await migrate(f.admin); // No legacy fixture functions/extra grants in inventory.
  const installed = (await f.admin.query<{ migration_name: string }>("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r => r.migration_name);
  expect(installed).toEqual(MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!));
}, 120_000);
afterAll(async () => { await closeWorkFixture(f); });
async function transaction(work: (db: PoolClient) => Promise<void>) {
  const db = await f.admin.connect();
  try { await db.query("BEGIN"); await work(db); }
  finally { await db.query("ROLLBACK"); db.release(); }
}
it("catalogues customer entry points and requires delegation or an explicit tested disposition", async () => {
  await transaction(async db => {
    const roots = await assertInventory(db);
    process.stdout.write(roots.map(r => `${r.signature}: ${r.signature === delegated ? "delegates before business" :
      allowlist[r.signature] ?? "EXECUTE granted; reaches no guarded routine"}`).join("\n") + "\n");
  });
});
it("mutation: removing or delaying the portal binder fails the same catalogue assertion", async () => {
  for (const late of [false, true]) await transaction(async db => {
    const original = (await db.query("SELECT pg_get_functiondef($1::regprocedure) sql", [delegated])).rows[0].sql as string;
    const call = "PERFORM app.lp6_bind_customer_portal(t,j,c,digest);";
    let mutant = original.replace(call, "");
    if (late) mutant = mutant.replace("PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;", `PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE; ${call}`);
    expect(mutant).not.toBe(original);
    await db.query(mutant);
    await expect(assertInventory(db)).rejects.toThrow(delegated);
  });
});
it("mutation: direct, transitive and EXECUTE-granted customer paths cannot silently reach guarded code", async () => {
  for (const variant of ["prefix", "unqualified", "grant", "transitive", "literal", "sql-body", "quoted", "split-comment"] as const) await transaction(async db => {
    const granted = ["grant", "literal", "sql-body", "split-comment"].includes(variant);
    const name = granted ? "app.lp6d_new_entry" : "identity.customer_lp6d_new_entry";
    const target = variant === "unqualified" ? "begin_command" : variant === "split-comment" ? "app.begin_command /* call */" : "app.begin_command";
    const helper = variant === "quoted" ? 'app."lp6d quoted$hop"' : "app.lp6d_hop";
    if (["transitive", "quoted"].includes(variant)) await db.query(`CREATE FUNCTION ${helper}() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      PERFORM app.begin_command(NULL,NULL,NULL,NULL,NULL,NULL,NULL); END $$;
      REVOKE ALL ON FUNCTION ${helper}() FROM PUBLIC`);
    if (variant === "sql-body") await db.query(`CREATE FUNCTION ${name}() RETURNS uuid LANGUAGE sql
      BEGIN ATOMIC SELECT app.current_actor(); END`);
    else await db.query(`CREATE FUNCTION ${name}() RETURNS void LANGUAGE plpgsql SET search_path=app AS $$ BEGIN
      ${variant === "literal" ? "PERFORM length('-- /*');" : ""} PERFORM ${["transitive", "quoted"].includes(variant) ? `${helper}()` : `${target}(NULL,NULL,NULL,NULL,NULL,NULL,NULL)`}; END $$`);
    await db.query(`REVOKE ALL ON FUNCTION ${name}() FROM PUBLIC`);
    if (granted) await db.query(`GRANT EXECUTE ON FUNCTION ${name}() TO jobguard_identity`);
    expect((await inventory(db)).find(r => r.signature === `${name}()`)).toMatchObject({ guarded: true });
    await expect(assertInventory(db)).rejects.toThrow(`Unreviewed customer routine: ${name}()`);
  });
});

// Sole guarded exception: main permits a scoped live customer link to decide
// without a separate employee/member credential. Do not mask a regression by
// adding a member binding to the customer call. Pinned LP-6c currently fails
// this main-parity check with REQUEST_BINDING_REFUSED; that is a RED HOLD.
it("allowlisted client approval preserves main's unbound live-link decision and replay", async () => {
  const c = await cluster();
  try {
    const w = await chainWorld(c), s = await submitted(c, w, 150000), repo = new ExtraApprovalRepository(c.runtime), ctx = await w.ctx;
    await repo.approveExtraStep(await testActorContext(c.admin, ctx, w.members.supervisor.member), w.members.supervisor.member, approveInput(s, 0));
    await repo.approveExtraStep(await testActorContext(c.admin, ctx, w.supervisor2.member), w.supervisor2.member, approveInput(s, 1));
    const t = w.p.tenantId, actor = w.members.client_approver.member.membershipId;
    const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
    const signin = hash(), digest = hash();
    await repo.issueClientApproval(await testActorContext(c.admin, ctx, w.members.surveyor.member), w.members.surveyor.member, {
      version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
      approverMembershipId: actor, recipient: await emailOf(c, w, actor), linkToken: newToken(), signinDigest: signin,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const run = async (input: unknown, sessionDigest = digest) => {
      const db = await c.admin.connect();
      try {
        await db.query("BEGIN");
        await db.query("SET LOCAL ROLE jobguard_identity");
        const result = (await db.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb) result", [t, s.jobId, actor, sessionDigest, input])).rows[0].result;
        await db.query("COMMIT"); return result;
      } catch (error) { await db.query("ROLLBACK"); throw error; }
      finally { db.release(); }
    };
    const db = await c.admin.connect();
    try {
      await db.query("BEGIN"); await db.query("SET LOCAL ROLE jobguard_identity");
      expect((await db.query("SELECT identity.extra_customer_use($1,$2,$3,$4,$5,'redeem') result", [t, s.jobId, actor, signin, digest])).rows[0].result).toMatchObject({ extraApprover: true });
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const base = { version: "extra-customer.v1", jobId: s.jobId };
    expect(await run({ ...base, action: "queue" })).toMatchObject({ items: [{ requestId: s.requestId }] });
    expect(await run({ ...base, action: "view", requestId: s.requestId })).toMatchObject({ requestId: s.requestId, netPence: 150000 });
    expect(await run({ ...base, action: "history" })).toEqual({ items: [] });
    const decision = { ...base, action: "decide", requestId: s.requestId, commandId: randomUUID(), revisionHash: s.hash, netPence: s.net, decision: "approve" };
    const facts = async () => (await c.admin.query("SELECT row_to_json(x)::text value FROM app.extra_approval_outcome x WHERE tenant_id=$1 AND request_id=$2", [t, s.requestId])).rows;
    const before = await facts();
    await expect(run(decision, hash())).rejects.toMatchObject({ code: "42501", message: "CUSTOMER_REFUSED" });
    expect(await facts()).toEqual(before);
    expect((await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [t, decision.commandId])).rows[0].n).toBe(0);
    const result = await run(decision);
    expect(result).toMatchObject({ state: "approved" });
    expect(await run(decision)).toEqual(result);
    expect(await facts()).toHaveLength(1);
  } finally { await c.close(); }
}, 120_000);
