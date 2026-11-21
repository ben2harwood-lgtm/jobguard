import { createHash } from "node:crypto";
import { z } from "zod";

type Environment = Readonly<Record<string, string | undefined>>;
type PilotProcess = "web" | "api" | "worker";

export const pilotSessionCookie = "__Host-jobguard_pilot_session";
export const pilotCustomerCookie = "__Host-jobguard_pilot_customer";
export const pilotQueueSchema = "jobguard_pilot_queue";

const databases = {
  PILOT_RUNTIME_DATABASE_URL: /^jobguard_runtime$/u,
  IDENTITY_DATABASE_URL: /^jobguard_identity$/u,
  WORKER_DATABASE_URL: /^jobguard_pilot_worker_login$/u,
  GRAPHILE_DATABASE_URL: /^jobguard_pilot_queue_login$/u,
} as const;
type DatabaseSetting = keyof typeof databases;
const sharedSettings = [
  "AUTH_ALLOWED_ORIGIN", "PILOT_API_ORIGIN", "AUTH_CODE_SECRET",
  "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY",
] as const;
const pilotHost = /^pilot(?:[.-]|$)/u;
const pilotDatabase = /^jobguard_pilot(?:_[a-z0-9]+)*$/u;
const bindingsV1 = z.object({
  version: z.literal("pilot-resources.v1"),
  sha256: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)),
}).strict();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export class PilotResourceError extends Error {
  readonly code = "PILOT_RESOURCE_BINDING_REFUSED";
  constructor(readonly setting: string) { super("PILOT_RESOURCE_BINDING_REFUSED"); }
}

function url(value: string | undefined): URL | undefined {
  try { return value ? new URL(value) : undefined; } catch { return undefined; }
}

function pilotOrigin(value: string): boolean {
  const parsed = url(value);
  return !!parsed && parsed.protocol === "https:" && parsed.origin === value && pilotHost.test(parsed.hostname);
}

function pilotDatabaseTarget(value: string, setting: DatabaseSetting) {
  const parsed = url(value);
  if (!parsed || !/^postgres(?:ql)?:$/u.test(parsed.protocol) || !parsed.hostname || !parsed.password || parsed.hash ||
      (parsed.search !== "" && parsed.search !== "?sslmode=verify-full") ||
      !databases[setting].test(parsed.username) || !pilotDatabase.test(parsed.pathname.slice(1))) {
    throw new PilotResourceError(setting);
  }
  const database = parsed.pathname.slice(1);
  if (setting === "GRAPHILE_DATABASE_URL" ? database !== "jobguard_pilot_queue" :
      /^jobguard_pilot_(?:queue|restore)(?:_|$)/u.test(database)) throw new PilotResourceError(setting);
  try { return { password: decodeURIComponent(parsed.password) }; }
  catch { throw new PilotResourceError(setting); }
}

/** The immutable deploy manifest pins the exact injected values without containing the credentials. */
export function requirePilotResources(env: Environment, process: PilotProcess) {
  if (env.JOBGUARD_ENV !== "pilot_no_charge") throw new PilotResourceError("JOBGUARD_ENV");
  let raw: unknown;
  try { raw = JSON.parse(env.JOBGUARD_PILOT_RESOURCES ?? ""); }
  catch { throw new PilotResourceError("JOBGUARD_PILOT_RESOURCES"); }
  const manifest = bindingsV1.safeParse(raw);
  if (!manifest.success) throw new PilotResourceError("JOBGUARD_PILOT_RESOURCES");
  const pins = manifest.data.sha256;
  function pinned(setting: string): string {
    const value = env[setting];
    if (!value || pins[setting] !== digest(value)) throw new PilotResourceError(setting);
    return value;
  }

  for (const setting of sharedSettings) pinned(setting);
  const webOrigin = pinned("AUTH_ALLOWED_ORIGIN");
  const apiOrigin = pinned("PILOT_API_ORIGIN");
  if (!pilotOrigin(webOrigin) || !pilotOrigin(apiOrigin) || new URL(webOrigin).hostname === new URL(apiOrigin).hostname) {
    throw new PilotResourceError("AUTH_ALLOWED_ORIGIN");
  }
  const endpoint = url(pinned("S3_ENDPOINT"));
  if (!endpoint || !["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash || endpoint.pathname !== "/" ||
      !/^jobguard-pilot-(?!restore-)[a-z0-9-]+$/u.test(pinned("S3_BUCKET"))) throw new PilotResourceError("S3_ENDPOINT");
  if (pinned("AUTH_CODE_SECRET").length < 32) throw new PilotResourceError("AUTH_CODE_SECRET");
  if (env.GRAPHILE_WORKER_SCHEMA && env.GRAPHILE_WORKER_SCHEMA !== pilotQueueSchema) throw new PilotResourceError("GRAPHILE_WORKER_SCHEMA");
  if (env.JOBGUARD_WORKER_PRACTICE_FINAL_CHECK_ONLY) throw new PilotResourceError("JOBGUARD_WORKER_PRACTICE_FINAL_CHECK_ONLY");
  if (env.DATABASE_URL || env.RUNTIME_DATABASE_URL || env.SHADOW_DATABASE_URL || env.MIGRATION_DATABASE_URL ||
      Object.keys(env).some(name => /^(?:STRIPE|GOCARDLESS|PAYMENT|SANDBOX)_/u.test(name) && env[name])) {
    throw new PilotResourceError("non-pilot credentials");
  }

  const settings: DatabaseSetting[] = ["PILOT_RUNTIME_DATABASE_URL", "IDENTITY_DATABASE_URL"];
  if (process === "worker") settings.push("WORKER_DATABASE_URL", "GRAPHILE_DATABASE_URL");
  const passwords = new Set([pinned("AUTH_CODE_SECRET"), pinned("S3_SECRET_ACCESS_KEY")]);
  if (passwords.size !== 2) throw new PilotResourceError("S3_SECRET_ACCESS_KEY");
  for (const setting of settings) {
    const target = pilotDatabaseTarget(pinned(setting), setting);
    if (passwords.has(target.password)) throw new PilotResourceError(setting);
    passwords.add(target.password);
  }
  const runtime = pinned("PILOT_RUNTIME_DATABASE_URL"), identity = pinned("IDENTITY_DATABASE_URL");
  if (new URL(runtime).host !== new URL(identity).host || new URL(runtime).pathname !== new URL(identity).pathname) {
    throw new PilotResourceError("IDENTITY_DATABASE_URL");
  }
  const queue = process === "worker" ? pinned("GRAPHILE_DATABASE_URL") : undefined;
  const worker = process === "worker" ? pinned("WORKER_DATABASE_URL") : undefined;
  if (worker && (new URL(worker).host !== new URL(runtime).host || new URL(worker).pathname !== new URL(runtime).pathname)) {
    throw new PilotResourceError("WORKER_DATABASE_URL");
  }
  return { webOrigin, apiOrigin, runtime, identity, queue, worker };
}

/** Reserve pilot resource names even when a legacy deployment has no pilot manifest. */
export function refusePilotResourcesOutsidePilot(env: Environment): void {
  if (env.JOBGUARD_ENV === "pilot_no_charge") return;
  if (env.JOBGUARD_PILOT_RESOURCES || ["PILOT_RUNTIME_DATABASE_URL", "PILOT_API_ORIGIN", "PILOT_RESTORE_DATABASE_URL",
      "PILOT_RESTORE_BUCKET", "PILOT_RESTORE_S3_ENDPOINT", "PILOT_RESTORE_S3_ACCESS_KEY_ID", "PILOT_RESTORE_S3_SECRET_ACCESS_KEY"].some(key => env[key]) ||
      ["DATABASE_URL", "RUNTIME_DATABASE_URL", "SHADOW_DATABASE_URL", "IDENTITY_DATABASE_URL",
        "WORKER_DATABASE_URL", "GRAPHILE_DATABASE_URL", "MIGRATION_DATABASE_URL"].some(setting => {
        const parsed = url(env[setting]);
        if (!parsed) return false;
        try { return pilotDatabase.test(decodeURIComponent(parsed.pathname.slice(1))) ||
          /^jobguard_pilot_/u.test(decodeURIComponent(parsed.username)); }
        catch { throw new PilotResourceError(setting); }
      }) ||
      pilotHost.test(url(env.AUTH_ALLOWED_ORIGIN)?.hostname ?? "") ||
      env.S3_BUCKET?.startsWith("jobguard-pilot-") || env.GRAPHILE_WORKER_SCHEMA === pilotQueueSchema) {
    throw new PilotResourceError("JOBGUARD_ENV");
  }
}
