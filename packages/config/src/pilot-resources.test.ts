import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { PilotResourceError, pilotQueueSchema, refusePilotResourcesOutsidePilot, requirePilotResources } from "./pilot-resources.js";

const url = (login: string, database = "jobguard_pilot_fixture") =>
  `postgresql://${login}:fictional-${login}@db.invalid/${database}`;
const values = {
  AUTH_ALLOWED_ORIGIN: "https://pilot-web.invalid",
  PILOT_API_ORIGIN: "https://pilot-api.invalid",
  AUTH_CODE_SECRET: "fictional pilot signing key for configuration tests",
  S3_ENDPOINT: "https://store.invalid",
  S3_REGION: "fictional-region",
  S3_BUCKET: "jobguard-pilot-evidence",
  S3_ACCESS_KEY_ID: "fictional-pilot-access-id",
  S3_SECRET_ACCESS_KEY: "fictional-pilot-storage-secret",
  PILOT_RUNTIME_DATABASE_URL: url("jobguard_runtime"),
  IDENTITY_DATABASE_URL: url("jobguard_identity"),
  WORKER_DATABASE_URL: url("jobguard_pilot_worker_login"),
  GRAPHILE_DATABASE_URL: url("jobguard_pilot_queue_login", "jobguard_pilot_queue"),
};

function deployment(overrides: Record<string, string> = {}) {
  const bound = { ...values, ...overrides };
  const sha256 = Object.fromEntries(Object.entries(bound).map(([key, value]) =>
    [key, createHash("sha256").update(value).digest("hex")]));
  return { JOBGUARD_ENV: "pilot_no_charge", ...bound, JOBGUARD_PILOT_RESOURCES: JSON.stringify({ version: "pilot-resources.v1", sha256 }) };
}

it.each(["web", "api", "worker"] as const)("binds the exact pilot resources for %s", process => {
  expect(requirePilotResources(deployment(), process)).toMatchObject({ runtime: values.PILOT_RUNTIME_DATABASE_URL });
  expect(() => requirePilotResources(values, process)).toThrow(PilotResourceError);
});

it.each(Object.keys(values))("refuses a missing or substituted %s", setting => {
  expect(() => requirePilotResources({ ...deployment(), [setting]: undefined }, "worker")).toThrow(PilotResourceError);
  expect(() => requirePilotResources({ ...deployment(), [setting]: "substituted" }, "worker")).toThrow(PilotResourceError);
});

it.each([
  { AUTH_ALLOWED_ORIGIN: "https://practice.invalid" },
  { PILOT_API_ORIGIN: values.AUTH_ALLOWED_ORIGIN },
  { IDENTITY_DATABASE_URL: url("jobguard_identity", "jobguard_synthetic_demo") },
  { IDENTITY_DATABASE_URL: url("jobguard_runtime") },
  { PILOT_RUNTIME_DATABASE_URL: `${values.PILOT_RUNTIME_DATABASE_URL}?dbname=jobguard_synthetic_demo` },
  { PILOT_RUNTIME_DATABASE_URL: url("jobguard_runtime", "jobguard_pilot_restore") },
  { WORKER_DATABASE_URL: url("jobguard_runtime") },
  { GRAPHILE_DATABASE_URL: url("jobguard_pilot_queue_login") },
  { S3_BUCKET: "jobguard-practice-evidence" },
  { S3_BUCKET: "jobguard-pilot-restore-evidence" },
  { S3_SECRET_ACCESS_KEY: values.AUTH_CODE_SECRET },
])("refuses forbidden separation even if pinned (%j)", override => {
  expect(() => requirePilotResources(deployment(override), "worker")).toThrow(PilotResourceError);
});

it("refuses practice and billing configuration in pilot even with valid pilot bindings", () => {
  expect(() => requirePilotResources({ ...deployment(), DATABASE_URL: url("jobguard_runtime", "jobguard_synthetic_demo") }, "api")).toThrow(PilotResourceError);
  expect(() => requirePilotResources({ ...deployment(), STRIPE_SECRET_KEY: "fictional" }, "worker")).toThrow(PilotResourceError);
});

it.each(["synthetic_demo", "provider_sandbox", "production_billing"])("reserves pilot resources in %s", JOBGUARD_ENV => {
  for (const bound of [
    { DATABASE_URL: values.PILOT_RUNTIME_DATABASE_URL },
    { IDENTITY_DATABASE_URL: values.IDENTITY_DATABASE_URL },
    { WORKER_DATABASE_URL: values.WORKER_DATABASE_URL },
    { AUTH_ALLOWED_ORIGIN: values.AUTH_ALLOWED_ORIGIN },
    { GRAPHILE_WORKER_SCHEMA: pilotQueueSchema },
    { S3_BUCKET: values.S3_BUCKET },
  ]) expect(() => refusePilotResourcesOutsidePilot({ JOBGUARD_ENV, ...bound })).toThrow(PilotResourceError);
  expect(() => refusePilotResourcesOutsidePilot({ JOBGUARD_ENV, DATABASE_URL: url("jobguard_runtime", "jobguard_synthetic_demo") })).not.toThrow();
});
