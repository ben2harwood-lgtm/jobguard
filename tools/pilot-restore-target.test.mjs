import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { requirePilotRestoreTarget } from "./pilot-restore-target.mjs";

function fixture(overrides = {}) {
  const values = {
    PILOT_RUNTIME_DATABASE_URL: "postgresql://jobguard_runtime:fictional-runtime@runtime.invalid/jobguard_pilot",
    PILOT_RESTORE_DATABASE_URL: "postgresql://jobguard_pilot_restore_login:fictional-restore@restore.invalid/jobguard_pilot_restore",
    S3_BUCKET: "jobguard-pilot-evidence",
    S3_ACCESS_KEY_ID: "fictional-runtime-storage-access",
    S3_SECRET_ACCESS_KEY: "fictional-runtime-storage-key",
    PILOT_RESTORE_S3_ENDPOINT: "https://restore-storage.invalid",
    PILOT_RESTORE_S3_ACCESS_KEY_ID: "fictional-restore-storage-access",
    PILOT_RESTORE_S3_SECRET_ACCESS_KEY: "fictional-restore-storage-key",
    PILOT_RESTORE_BUCKET: "jobguard-pilot-restore-evidence",
    ...overrides,
  };
  const sha256 = Object.fromEntries(Object.entries(values).map(([key, value]) =>
    [key, createHash("sha256").update(value).digest("hex")]));
  return { ...values, JOBGUARD_ENV: "pilot_no_charge", JOBGUARD_COMMERCIAL_OUTBOUND: "paused",
    JOBGUARD_PILOT_RESOURCES: JSON.stringify({ version: "pilot-resources.v1", sha256 }) };
}

test("restore preflight accepts the separately pinned isolated destination while paused", () => {
  assert.doesNotThrow(() => requirePilotRestoreTarget(fixture()));
});

test("restore preflight refuses another mode, substituted binding and unpaused execution", () => {
  for (const overrides of [
    { JOBGUARD_ENV: "synthetic_demo" },
    { JOBGUARD_COMMERCIAL_OUTBOUND: "enabled" },
    { JOBGUARD_PILOT_RESOURCES: undefined },
    { PILOT_RESTORE_BUCKET: "jobguard-pilot-restore-changed" },
  ]) assert.throws(() => requirePilotRestoreTarget({ ...fixture(), ...overrides }), /PILOT_RESTORE_BINDING_REFUSED/u);
});

test("even signed-off pins cannot authorize restoring to practice or a live pilot target", () => {
  const isolated = fixture().PILOT_RESTORE_DATABASE_URL;
  for (const overrides of [
    { PILOT_RESTORE_DATABASE_URL: isolated.replace("jobguard_pilot_restore", "jobguard_runtime") },
    { PILOT_RESTORE_DATABASE_URL: isolated.replace("/jobguard_pilot_restore", "/jobguard_synthetic_demo") },
    { PILOT_RESTORE_DATABASE_URL: isolated.replace("restore.invalid", "runtime.invalid") },
    { PILOT_RESTORE_DATABASE_URL: `${isolated}?dbname=jobguard_pilot` },
    { PILOT_RESTORE_BUCKET: "jobguard-practice" },
    { S3_BUCKET: fixture().PILOT_RESTORE_BUCKET },
    { PILOT_RESTORE_S3_ACCESS_KEY_ID: fixture().S3_ACCESS_KEY_ID },
    { PILOT_RESTORE_S3_SECRET_ACCESS_KEY: fixture().S3_SECRET_ACCESS_KEY },
  ]) assert.throws(() => requirePilotRestoreTarget(fixture(overrides)), /PILOT_RESTORE_BINDING_REFUSED/u);
});
