import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { IdentityRepository } from "../src/identity-repository.js";
import { FakeTrueLayerAisAdapter, SyntheticAisTokenVault, type AisPage } from "../src/ais-adapter.js";
import { DarkAisRepository } from "../src/ais-repository.js";
import { PracticeBankApplication } from "../../../apps/api/src/practice-bank.application.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";

let f: WorkFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createWorkFixture(); }, 120_000);
afterAll(async () => { await closeWorkFixture(f); vi.unstubAllEnvs(); });
const origin = "https://company.invalid";
const command = (operation: string, connectionId?: string) => ({ version: "ais-practice-command.v1", operation, ...(connectionId ? { connectionId } : {}) });
const expected = (["pending", "settled", "reversed"] as const).map((status, i) => ({
  movementRef: `fake_${status}`, status, pence: [12001, 32000, -4500][i]!, currency: "GBP" as const, bookedOn: "2026-10-02",
})).sort((a, b) => a.movementRef.localeCompare(b.movementRef));

// These are the existing work/session fixtures, with real authentication and SQL authority
// throughout the application flow. No context is constructed by this test.
it.each([false, true])("keeps both members' movements visible in either pull order (admin first: %s)", async adminFirst => {
  const owner = await meterCompany(f), admin = await meterCompany(f, owner.tenantId);
  await f.admin.query("UPDATE app.membership SET role='admin' WHERE id=$1", [admin.actorId]);
  const provider = new PersistedAuthProvider(new IdentityRepository(f.admin), "fictional-member-bank-identity-key-181");
  const memory = { pending: new Map(), adapter: new FakeTrueLayerAisAdapter(), vault: new SyntheticAisTokenVault(),
    pages: new Map<string, AisPage>([["first", { version: "ais-page.v1", nextCursor: null, observations: expected.map(m => ({
      version: "ais-observation.v1", accountRef: "fake_practice_account", movementRef: m.movementRef,
      providerRef: `fake_provider_${m.status}`, revision: 1, status: m.status, amount: { pence: m.pence, currency: m.currency }, bookedOn: m.bookedOn,
    })) }]]) };
  const app = new PracticeBankApplication(new IdentityApplication(provider, origin), new DarkAisRepository(f.runtime, memory.adapter, memory.vault, "synthetic_demo"), memory);
  async function session(company: typeof owner) {
    const sessionToken = `${randomUUID()}${randomUUID()}`, csrfToken = randomUUID();
    const user = (await f.admin.query("SELECT user_id FROM identity.session WHERE id=$1", [company.sessionId])).rows[0].user_id;
    await f.admin.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
      VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')`, [randomUUID(), user, provider.digest(`session:${sessionToken}`), csrfToken]);
    return { sessionToken, csrfToken, tenantHeader: company.tenantId, origin };
  }
  const ownerRequest = await session(owner), adminRequest = await session(admin);
  // Snapshot all tenant business tables, including cash, landing and fee records.
  // AIS and its append-only audit events are the only expected changes.
  async function businessSnapshot() {
    const tables = (await f.admin.query<{ table_name: string }>(`SELECT table_name FROM information_schema.columns
      WHERE table_schema='app' AND column_name='tenant_id' AND table_name NOT LIKE 'ais_%'
      AND table_name NOT LIKE 'audit_%' ORDER BY table_name`)).rows;
    const rows: Record<string, unknown> = {};
    for (const { table_name: name } of tables) rows[name] = (await f.admin.query(
      `SELECT to_jsonb(r) row FROM app."${name}" r WHERE tenant_id=$1 ORDER BY to_jsonb(r)::text`, [owner.tenantId])).rows;
    return rows;
  }
  const before = await businessSnapshot();
  async function connect(request: typeof ownerRequest) {
    const start = await app.command(request, command("start")), id = start.connection!.connectionId;
    await app.command(request, command("approve-fake-consent", id));
    return id;
  }
  const ownerConnection = await connect(ownerRequest), adminConnection = await connect(adminRequest);
  const requests = adminFirst ? [[adminRequest, adminConnection], [ownerRequest, ownerConnection]] as const
    : [[ownerRequest, ownerConnection], [adminRequest, adminConnection]] as const;
  for (const [request, id] of requests) {
    await app.command(request, command("pull", id));
    expect((await app.read(request)).movements).toEqual(expected);
    await app.command(request, command("pull", id));
    expect((await app.read(request)).movements).toEqual(expected);
  }
  const accounts = async () => (await f.admin.query("SELECT a.id,l.account_ref FROM app.ais_connection a JOIN app.ais_lifecycle l ON l.tenant_id=a.tenant_id AND l.connection_id=a.id AND l.kind='linked' WHERE a.tenant_id=$1 ORDER BY a.created_at,a.id", [owner.tenantId])).rows;
  const firstAccounts = await accounts();
  expect(new Set(firstAccounts.map(row => row.account_ref)).size).toBe(2);
  await expect(app.command(adminRequest, command("pull", ownerConnection))).rejects.toThrow("AIS_NOT_FOUND");
  await expect(app.command(ownerRequest, command("approve-fake-consent", adminConnection))).rejects.toThrow("AIS_NOT_FOUND");
  const reconnect = await connect(ownerRequest);
  // History remains visible before pulling on the second connection.
  expect((await app.read(ownerRequest)).movements).toEqual(expected);
  await app.command(ownerRequest, command("pull", reconnect));
  expect(await memory.vault.get(ownerConnection)).toBeUndefined();
  const renewed = await session(owner), renewedConnection = await connect(renewed);
  expect((await app.read(renewed)).movements).toEqual(expected);
  await app.command(renewed, command("pull", renewedConnection));
  const allAccounts = await accounts(), ownerAccount = firstAccounts.find(row => row.id === ownerConnection)!.account_ref;
  for (const id of [reconnect, renewedConnection]) expect(allAccounts.find(row => row.id === id)!.account_ref).toBe(ownerAccount);
  expect((await app.read(adminRequest)).movements).toEqual(expected);
  expect((await app.read(renewed)).movements).toEqual(expected);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.ais_observation WHERE tenant_id=$1", [owner.tenantId])).rows[0].n).toBe(6);
  expect(await businessSnapshot()).toEqual(before);
}, 120_000);
