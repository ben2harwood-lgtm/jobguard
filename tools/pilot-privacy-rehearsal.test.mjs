import assert from "node:assert/strict";
import { test } from "node:test";
import { createPilotPrivacyRehearsal, policy } from "./pilot-privacy-rehearsal.mjs";

const failure = /PILOT_PRIVACY_REHEARSAL_REFUSED/u;
const resident = { tenantId: "fictional-builder", subjectId: "fictional-resident" };
const neighbour = { ...resident, subjectId: "fictional-neighbour" };
const foreign = { ...resident, tenantId: "fictional-other-builder" };

function fixture() {
  let now = Date.UTC(2026, 0, 1);
  const scope = { ...resident, requesterCredential: "resident", instructionCredential: "controller" };
  const subject = { ...resident, identityVerified: true, authorityVerified: true, controller: "contractor" };
  const auth = new Map([
    ["privacy", { tenantId: resident.tenantId, role: "privacy_operator" }],
    ["restore", { tenantId: resident.tenantId, role: "restore_operator" }],
    ["resident", subject], ["neighbour", { ...subject, ...neighbour }], ["foreign", { ...subject, ...foreign }],
    ["unverified", { ...subject, identityVerified: false }], ["no-authority", { ...subject, authorityVerified: false }],
  ]);
  const record = (kind, data = {}) => ({ ...resident, kind, id: kind, status: "active", ...data });
  const records = [
    record("source_version", { id: "evidence:v1", versionId: "v1", release: { text: "first original" } }),
    record("source_version", { id: "evidence:v2", versionId: "v2", release: { text: "second original" }, mixedPayload: "other person's data" }),
    ...["derived", "cache", "log", "accounting", "legal"].map(kind => record(kind, { release: { note: `reviewed ${kind}` } })),
    record("shadow", { jobId: "fictional-job", release: { note: "reviewed shadow excerpt" } }),
    record("shadow", { id: "unselected-shadow", jobId: "fictional-job", mixedPayload: "withheld" }),
    ...["session", "object_grant", "queue", "inflight", "prior_export", "processor_copy"].map(kind => record(kind)),
    record("backup", { createdAt: now }),
    ...[neighbour, foreign].flatMap(peer => [record("session", peer), record("source_version", { ...peer, release: "other person's data" })]),
  ];
  const disclosures = new Map();
  const state = { snapshotCalls: 0 };
  const workflow = createPilotPrivacyRehearsal({
    records,
    verify(credential, role, request) {
      if (role !== "controller_instruction") return auth.get(credential);
      return credential === "controller" && request.tenantId === resident.tenantId && request.subjectId === resident.subjectId &&
        ["access", "export", "delete"].includes(request.operation);
    },
    snapshot(tenantId) {
      state.snapshotCalls++;
      assert.equal(workflow.usable("resident", "session", "session"), false);
      return state.failRestore ? records : records.filter(row => row.tenantId === tenantId);
    },
    async disclose(event) {
      if (state.failDisclosure) return undefined;
      disclosures.set(event.eventId, { ...event, feeEligible: false });
      if (state.revokeDuringDisclosure) auth.delete("resident");
      return event.eventId;
    },
    clock: () => now,
  });
  const operator = workflow.operator("privacy", "privacy_operator");
  const restorer = workflow.operator("restore", "restore_operator");
  const request = (operation, patch = {}) => workflow.review(operator, { ...scope, operation, ...patch });
  return { workflow, request, operator, restorer, disclosures, auth, state, advance: ms => { now += ms; } };
}

test("review requires verified identity, authority, tenant and controller instruction", async () => {
  const f = fixture();
  for (const patch of [{ requesterCredential: "unverified" }, { requesterCredential: "no-authority" },
    { requesterCredential: "foreign", ...foreign }, { requesterCredential: "neighbour" }, { instructionCredential: "wrong" }]) {
    assert.throws(() => f.request("access", patch), failure);
  }
  const approval = f.request("access");
  f.auth.delete("privacy");
  await assert.rejects(f.workflow.execute(f.operator, approval), failure);
  assert.equal(f.disclosures.size, 0);
});

test("export is scoped, versioned and redacted, and awaits a stable restricted disclosure receipt", async () => {
  const f = fixture();
  const approval = f.request("export");
  f.state.failDisclosure = true;
  await assert.rejects(f.workflow.execute(f.operator, approval), failure);
  f.state.failDisclosure = false;
  const rows = await f.workflow.execute(f.operator, approval);
  assert.deepEqual(rows.filter(row => row.kind === "source_version").map(row => row.versionId), ["v1", "v2"]);
  assert.deepEqual(rows.map(row => row.kind), ["source_version", "source_version", "derived", "cache", "log", "accounting", "legal", "shadow"]);
  assert.doesNotMatch(JSON.stringify(rows), /other person's data|withheld/u);
  assert.deepEqual(await f.workflow.execute(f.operator, approval), rows);
  assert.equal(f.disclosures.size, 1);
  const [event] = f.disclosures.values();
  assert.deepEqual(event, { route: "export", tenantId: resident.tenantId, jobId: "fictional-job", signalId: "shadow",
    eventId: event.eventId, feeEligible: false });
  await f.workflow.execute(f.operator, f.request("access"));
  assert.ok([...f.disclosures.values()].some(disclosure => disclosure.route === "data_subject_access"));
});

test("a requester losing authority during shadow disclosure receives no export", async () => {
  const f = fixture();
  const approval = f.request("access");
  f.state.revokeDuringDisclosure = true;
  await assert.rejects(f.workflow.execute(f.operator, approval), failure);
  assert.equal(f.disclosures.size, 1);
});

test("erasure fences sessions, object grants and work, and restore reapplies the restricted tombstone", async () => {
  const f = fixture();
  const oldExport = f.request("export");
  const deletion = f.request("delete");
  const kinds = ["session", "object_grant", "queue"];
  for (const kind of kinds) assert.equal(f.workflow.usable("resident", kind, kind), true);
  const receipt = await f.workflow.execute(f.operator, deletion);
  assert.deepEqual(receipt, { receiptId: receipt.receiptId, backupsErased: false, restricted: 4, confirmationPending: 1, outcomeUnknown: 1 });
  assert.deepEqual(await f.workflow.execute(f.operator, deletion), receipt);
  await assert.rejects(f.workflow.execute(f.operator, oldExport), failure);
  assert.throws(() => f.workflow.restore(f.operator), failure);
  f.workflow.restore(f.restorer);
  f.workflow.restore(f.restorer);
  assert.equal(f.state.snapshotCalls, 2);
  for (const kind of kinds) assert.equal(f.workflow.usable("resident", kind, kind), false);
  for (const peer of ["neighbour", "foreign"]) assert.equal(f.workflow.usable(peer, "session", "session"), true);
  assert.deepEqual(await f.workflow.execute(f.operator, f.request("export")), []);
  assert.equal(f.disclosures.size, 0);
});

test("a failed restore keeps access and dispatch fenced", () => {
  const f = fixture();
  f.state.failRestore = true;
  assert.throws(() => f.workflow.restore(f.restorer), failure);
  assert.equal(f.workflow.usable("resident", "session", "session"), false);
  assert.equal(f.workflow.usable("resident", "queue", "queue"), false);
  assert.throws(() => f.request("access"), failure);
});

test("provisional backup expiry needs the authorised operator, elapsed retention and exact-copy confirmation", () => {
  const f = fixture();
  const confirm = id => id === "backup";
  assert.throws(() => f.workflow.expireBackup(f.restorer, "backup", confirm), failure);
  f.advance(policy.backupRetentionMs);
  assert.throws(() => f.workflow.expireBackup(f.operator, "backup", confirm), failure);
  assert.throws(() => f.workflow.expireBackup(f.restorer, "backup", () => false), failure);
  f.workflow.expireBackup(f.restorer, "backup", confirm);
  f.workflow.restore(f.restorer);
  assert.throws(() => f.workflow.expireBackup(f.restorer, "backup", confirm), failure);
});
