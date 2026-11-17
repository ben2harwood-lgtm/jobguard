/** ENT-10a2 D3. NOT RUN (sandbox cannot start PostgreSQL / a browser). */
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnterpriseIdentityRepository, ScimRepository } from "../src/index.js";
import { ScimApplication } from "../../../apps/api/src/auth/sso/scim.application.js";
import { scimBearerFor, scimStatus } from "../../../apps/api/src/auth/sso/scim.contracts.js";
import { SsoApplication } from "../../../apps/api/src/auth/sso/sso.application.js";
import { auditRows, canonicalRows, createScimHarness, deactivate, fixture, memberIn, person } from "./scim-fixtures.js";

type Harness = Awaited<ReturnType<typeof createScimHarness>>;
type Fixture = Awaited<ReturnType<typeof fixture>>;
let h: Harness;
beforeAll(async () => { h = await createScimHarness("ent10a2-races"); }, 120000);
afterAll(async () => { await h?.close(); });

const tables = ["app.membership", "identity.session", "app.role_grant_revocation", "identity.scim_event", "app.audit_event", "audit_control.audit_head"] as const;
const historyTables = [...tables, "app.role_grant", "app.contractor_member", "identity.sso_connection", "identity.verified_domain", "identity.idp_group_role_mapping", "identity.sso_subject", "identity.sso_session_binding", "identity.sso_grant", "identity.membership_locator", "identity.identity_user", "identity.user_email", "identity.invitation", "identity.sso_required_event", "app.journal", "app.journal_line", "app.evidence_object"];
async function snapshot(names: readonly string[] = tables) {
  const result: Record<string, string[]> = {};
  for (const table of names) result[table] = await canonicalRows(h, table);
  return result;
}
async function events(f: Fixture, eventIds: string[]) {
  return (await h.admin.query("SELECT row_to_json(e)::text value FROM identity.scim_event e WHERE tenant_id=$1 AND connection_id=$2 AND source_event_id=ANY($3::uuid[]) ORDER BY source_event_id", [f.principal.tenantId, f.connectionId, eventIds])).rows.map(r => r.value);
}
async function recorded(f: Fixture, eventIds: string[]) {
  return (await h.admin.query("SELECT outcome,cause_code FROM identity.scim_event WHERE tenant_id=$1 AND connection_id=$2 AND source_event_id=ANY($3::uuid[]) ORDER BY source_event_id", [f.principal.tenantId, f.connectionId, eventIds])).rows;
}

function poolFor(client: PoolClient): Pool {
  // The real repositories retain BEGIN/COMMIT and audit; the fixture retains one distinct backend.
  return { query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release: () => undefined }) } as unknown as Pool;
}
function serviceFor(client: PoolClient) { return new ScimApplication(new ScimRepository(poolFor(client)), "synthetic_demo", h.seed); }
const body = (subject: string, eventId: string) => ({ version: "scim-deactivation.v1", eventId, subject, active: false });
const authorization = (f: Fixture) => ["Bearer", scimBearerFor(h.seed, f.connectionId)].join(" ");

async function observeBothWaiting(pids: number[]) {
  // Observe server lock state without a clock override, timer, worker or scheduling dependency.
  for (let observation = 0; observation < 2000; observation++) {
    const rows = (await h.admin.query("SELECT pid FROM pg_locks WHERE pid=ANY($1::int[]) AND locktype='advisory' AND mode='ExclusiveLock' AND NOT granted ORDER BY pid", [pids])).rows;
    if (rows.length === 2) { expect(rows.map(r => r.pid).sort()).toEqual([...pids].sort()); return; }
  }
  throw new Error("Both independent transactions must be observed waiting on the company lock");
}
async function race<T, U>(f: Fixture, firstWork: (client: PoolClient) => Promise<T>, secondWork: (client: PoolClient) => Promise<U>): Promise<[PromiseSettledResult<T>, PromiseSettledResult<U>]> {
  const first = await h.identity.connect(), second = await h.identity.connect(), blocker = await h.admin.connect();
  let pending: Promise<[PromiseSettledResult<T>, PromiseSettledResult<U>]> | undefined;
  try {
    const pids = [(await first.query("SELECT pg_backend_pid() pid")).rows[0].pid, (await second.query("SELECT pg_backend_pid() pid")).rows[0].pid];
    expect(new Set(pids).size).toBe(2);
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [f.principal.tenantId]);
    pending = Promise.allSettled([firstWork(first), secondWork(second)]);
    await observeBothWaiting(pids);
    await blocker.query("COMMIT");
    return await pending;
  } finally {
    await blocker.query("ROLLBACK");
    if (pending) await pending;
    first.release(); second.release(); blocker.release();
  }
}
function fulfilled<T>(result: PromiseSettledResult<T>): T {
  expect(result.status).toBe("fulfilled");
  if (result.status !== "fulfilled") throw result.reason;
  return result.value;
}

describe("ENT-10a2 independent connection replay and races", () => {
  it("[R1] replays all four stored outcomes without any record, revocation or audit write", async () => {
    const f = await fixture(h), p = await person(f), messages: Array<{ subject: string; eventId: string; outcome: string; cause: string }> = [
      { subject: p.subject, eventId: randomUUID(), outcome: "deactivated", cause: "SCIM_DEACTIVATED" },
      { subject: p.subject, eventId: randomUUID(), outcome: "ignored", cause: "SCIM_ALREADY_INACTIVE" },
      { subject: randomUUID(), eventId: randomUUID(), outcome: "ignored", cause: "SCIM_SUBJECT_NOT_LINKED" },
      { subject: f.principal.identityUserId, eventId: randomUUID(), outcome: "refused", cause: "SCIM_OWNER_PROTECTED" },
    ];
    for (const message of messages) {
      const original = await deactivate(f, message, message.eventId);
      expect(original).toMatchObject({ outcome: message.outcome, cause: message.cause });
      const before = await snapshot(), refusalBefore = await canonicalRows(h, "identity.sso_refusal_event");
      expect(await deactivate(f, message, message.eventId)).toEqual(original);
      expect(await snapshot()).toEqual(before);
      expect(await canonicalRows(h, "identity.sso_refusal_event")).toEqual(refusalBefore);
    }
  });

  it("[R2] refuses changed content for one source id, retaining the original record and second person's access", async () => {
    const f = await fixture(h), p = await person(f), q = await person(f), eventId = randomUUID();
    await deactivate(f, p, eventId);
    const before = await snapshot(tables.filter(t => t !== "app.audit_event" && t !== "audit_control.audit_head"));
    const earlier = await auditRows(h, f.principal.tenantId), refusalBefore = await canonicalRows(h, "identity.sso_refusal_event");
    const earlierAudit = await canonicalRows(h, "app.audit_event");
    const otherHeads = await canonicalRows(h, "audit_control.audit_head", "tenant_id<>$1", [f.principal.tenantId]);
    const firstRecord = await events(f, [eventId]);
    let failure: unknown;
    try { await deactivate(f, q, eventId); } catch (error) { failure = error; }
    expect(scimStatus(failure)).toEqual({ code: "SCIM_EVENT_CONFLICT", status: 409 });
    expect(await snapshot(tables.filter(t => t !== "app.audit_event" && t !== "audit_control.audit_head"))).toEqual(before);
    expect(await events(f, [eventId])).toEqual(firstRecord);
    expect(await h.provider.authenticate(q.bound.sessionToken)).toBeDefined();
    const after = await auditRows(h, f.principal.tenantId);
    expect(after).toHaveLength(earlier.length + 1);
    expect(after.at(-1)).toMatchObject({ event_type: "sso.refused", payload: { references: { code: "SCIM_EVENT_CONFLICT" } } });
    const laterAudit = await canonicalRows(h, "app.audit_event");
    expect(laterAudit.filter(row => earlierAudit.includes(row))).toEqual(earlierAudit);
    expect(laterAudit).toHaveLength(earlierAudit.length + 1);
    expect(await canonicalRows(h, "audit_control.audit_head", "tenant_id<>$1", [f.principal.tenantId])).toEqual(otherHeads);
    expect(await canonicalRows(h, "identity.sso_refusal_event")).toHaveLength(refusalBefore.length + 1);
  });

  it("[R3] five rounds of the same message on two waiting backends produce one record and one audit event", async () => {
    const f = await fixture(h);
    for (let round = 0; round < 5; round++) {
      const p = await person(f), eventId = randomUUID(), earlier = await auditRows(h, f.principal.tenantId);
      const send = (client: PoolClient) => serviceFor(client).deactivate(f.connectionId, authorization(f), body(p.subject, eventId));
      const results = await race(f, send, send);
      expect(fulfilled(results[0])).toEqual(fulfilled(results[1]));
      expect(fulfilled(results[0])).toMatchObject({ outcome: "deactivated", cause: "SCIM_DEACTIVATED" });
      expect(await events(f, [eventId])).toHaveLength(1);
      const after = await auditRows(h, f.principal.tenantId);
      expect(after).toHaveLength(earlier.length + 1);
      expect(after.at(-1)?.event_type).toBe("sso.scim.deactivated");
    }
  });

  it("[R4] two waiting messages for one person serialize one deactivation and one already-inactive record", async () => {
    const f = await fixture(h), p = await person(f), ids = [randomUUID(), randomUUID()];
    const earlier = await auditRows(h, f.principal.tenantId);
    const results = await race(f,
      client => serviceFor(client).deactivate(f.connectionId, authorization(f), body(p.subject, ids[0]!)),
      client => serviceFor(client).deactivate(f.connectionId, authorization(f), body(p.subject, ids[1]!)));
    const values = results.map(fulfilled);
    expect(values.map(v => v.outcome).sort()).toEqual(["deactivated", "ignored"]);
    expect(values.find(v => v.outcome === "ignored")?.cause).toBe("SCIM_ALREADY_INACTIVE");
    expect(await recorded(f, ids)).toHaveLength(2);
    const after = await auditRows(h, f.principal.tenantId);
    expect(after).toHaveLength(earlier.length + 2);
    expect(after.slice(earlier.length).map(e => e.event_type).sort()).toEqual(["sso.scim.deactivated", "sso.scim.ignored"]);
    const times = (await h.admin.query("SELECT m.revoked_at::text membership_time,e.created_at::text event_time FROM app.membership m JOIN identity.scim_event e ON e.tenant_id=m.tenant_id AND e.user_id=m.identity_user_id WHERE m.tenant_id=$1 AND m.id=$2 AND e.outcome='deactivated'", [f.principal.tenantId, p.membershipId])).rows;
    expect(times).toHaveLength(1);
    expect(times[0].membership_time).toBe(times[0].event_time);
  });

  it("[R5] five sign-in races finish with no usable bound session whichever transaction gets the lock first", async () => {
    const f = await fixture(h);
    for (let round = 0; round < 5; round++) {
      const p = await person(f), eventId = randomUUID();
      const started = await f.app.start(f.connectionId, { version: "sso-start.v1", action: "signin" }, f.ordinary);
      const raw = { version: "sso-callback.v1", SAMLResponse: f.idp.response({ connection: f.connection, requestId: started.requestId, email: p.email, subject: p.subject, groups: ["finance"] }), relayState: started.relayState };
      const results = await race(f,
        client => serviceFor(client).deactivate(f.connectionId, authorization(f), body(p.subject, eventId)),
        client => new SsoApplication(h.provider, new EnterpriseIdentityRepository(poolFor(client)), "https://jobguard.invalid", "synthetic_demo").callback(f.connectionId, raw, started.relayState));
      expect(fulfilled(results[0])).toMatchObject({ outcome: "deactivated" });
      if (results[1].status === "fulfilled") expect(await h.provider.authenticate(results[1].value.sessionToken)).toBeUndefined();
      else expect(results[1].reason).toHaveProperty("code", "MEMBERSHIP_REVOKED");
      expect(await h.provider.authenticate(p.bound.sessionToken)).toBeUndefined();
      expect((await h.admin.query("SELECT revoked_at IS NOT NULL revoked FROM app.membership WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, p.membershipId])).rows).toEqual([{ revoked: true }]);
      expect((await h.admin.query("SELECT count(*)::int n FROM identity.session s JOIN identity.sso_session_binding b ON b.session_id=s.id JOIN identity.sso_subject x ON (x.tenant_id,x.connection_id,x.subject_hash)=(b.tenant_id,b.connection_id,b.subject_hash) WHERE b.tenant_id=$1 AND x.user_id=$2 AND s.revoked_at IS NULL", [f.principal.tenantId, p.userId])).rows[0].n).toBe(0);
      await auditRows(h, f.principal.tenantId);
    }
  });

  it("[R6] earlier messages replay in either order without changing a later re-admission", async () => {
    const f = await fixture(h), p = await person(f), ids = [randomUUID(), randomUUID(), randomUUID()];
    const originals = [await deactivate(f, p, ids[0]), await deactivate(f, p, ids[1])];
    // Table-owner fixture recreates the new membership/locator left by the merged invitation path.
    await h.admin.query("DELETE FROM identity.membership_locator WHERE user_id=$1 AND tenant_id=$2", [p.userId, f.principal.tenantId]);
    await memberIn(h, p.userId, f.principal.tenantId);
    originals.push(await deactivate(f, p, ids[2]));
    await h.admin.query("DELETE FROM identity.membership_locator WHERE user_id=$1 AND tenant_id=$2", [p.userId, f.principal.tenantId]);
    const admitted = await memberIn(h, p.userId, f.principal.tenantId);
    const before = await snapshot(historyTables), refusalBefore = await canonicalRows(h, "identity.sso_refusal_event");
    for (const order of [[2, 0, 1], [1, 0, 2]]) for (const index of order) {
      expect(await deactivate(f, p, ids[index])).toEqual(originals[index]);
      expect(await snapshot(historyTables)).toEqual(before);
      expect(await canonicalRows(h, "identity.sso_refusal_event")).toEqual(refusalBefore);
    }
    expect((await h.admin.query("SELECT revoked_at IS NULL active FROM app.membership WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, admitted])).rows).toEqual([{ active: true }]);
  });
});
