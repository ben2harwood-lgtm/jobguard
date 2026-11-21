import "server-only";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { createPilotWorkspaceApplication, pilotWorkspaceFailure, requirePilotG1 } from "@jobguard/api/workspace";
import { assertPilotConnection } from "@jobguard/db";
import { AuthError, hasNonPilotCookie, requirePilotResources } from "@jobguard/api/identity";
import { pilotIdentityApplication, identityCredentials } from "./identity-server";
import { jobsResponseV1, tenantIdV1 } from "./contracts";

const poolRegistry = globalThis as typeof globalThis & { __jobguardPilotPool?: { url: string; pool: Pool } };

function pilotPool(connectionString: string): Pool {
  if (process.env.JOBGUARD_HOSTING === "cloudflare") {
    return new Pool({ connectionString, max: 1, maxUses: 1, application_name: "jobguard-pilot-web" });
  }
  const configured = poolRegistry.__jobguardPilotPool;
  if (configured && configured.url !== connectionString) throw new Error("PILOT_DATABASE_BINDING_CHANGED");
  return (poolRegistry.__jobguardPilotPool ??= {
    url: connectionString, pool: new Pool({ connectionString, max: 4, application_name: "jobguard-pilot-web" }),
  }).pool;
}

export async function pilotWorkspaceApplication(request: Request, requestedTenantId: string) {
  requirePilotG1(process.env);
  const jar = await cookies();
  if (jar.get("jg_session") || jar.get("jg_practice_pair") || jar.get("jobguard_session") ||
      jar.get("jobguard_customer") || hasNonPilotCookie(request.headers.get("cookie") ?? undefined)) {
    throw new AuthError("UNAUTHENTICATED");
  }
  const resources = requirePilotResources(process.env, "web");
  if (new URL(request.url).origin !== resources.webOrigin) throw new AuthError("ORIGIN_FORBIDDEN");
  const credentials = await identityCredentials(request);
  // Browsers omit Origin on same-origin GET. The custom CSRF header is still required.
  if (request.method === "GET" && !credentials.origin) credentials.origin = resources.webOrigin;
  if (!credentials.sessionToken) throw new AuthError("UNAUTHENTICATED");
  const identity = pilotIdentityApplication();
  const pool = pilotPool(resources.runtime);
  try {
    await Promise.all([
      assertPilotConnection(pool, resources.runtime),
      assertPilotConnection(identity.provider.repository.pool, resources.identity),
    ]);
    return await createPilotWorkspaceApplication({ pool, identity }, { ...credentials, requestedTenantId });
  } finally {
    if (process.env.JOBGUARD_HOSTING === "cloudflare") await identity.provider.repository.pool.end();
  }
}

export async function pilotJobList(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    requirePilotG1(process.env);
    const tenant = tenantIdV1.safeParse(request.nextUrl.searchParams.get("tenantId"));
    if (!tenant.success) return NextResponse.json({ code: "TENANT_FORBIDDEN" }, { status: 403, headers });
    const application = await pilotWorkspaceApplication(request, tenant.data);
    const { tenantId, jobs } = await application.listJobs(request.nextUrl.searchParams.get("jobId") ?? undefined);
    return NextResponse.json(jobsResponseV1.parse({
      version: 1, tenantId, jobs: jobs.map(job => ({
        ...job, tenantId, customerLabel: "Details needed", siteLabel: "Details needed", updatedLabel: "",
        document: { kind: "unknown", reference: null, delivery: "unknown" },
        customerPayment: "unknown", pilotNoCharge: true,
      })),
    }), { headers });
  } catch (error) {
    const { code, status } = pilotWorkspaceFailure(error);
    return NextResponse.json({ code }, { status, headers });
  }
}

type PilotApplication = Awaited<ReturnType<typeof pilotWorkspaceApplication>>;
export async function pilotWorkspaceRoute(request: Request, work: (app: PilotApplication) => Promise<unknown>, status = 200) {
  const headers = { "Cache-Control": "no-store" };
  try {
    requirePilotG1(process.env);
    const tenant = tenantIdV1.safeParse(request.headers.get("x-tenant-id"));
    if (!tenant.success) return NextResponse.json({ code: "TENANT_FORBIDDEN" }, { status: 403, headers });
    const body = await work(await pilotWorkspaceApplication(request, tenant.data));
    if (body instanceof Response) {
      body.headers.set("Cache-Control", "no-store");
      return body;
    }
    return NextResponse.json(body, { status, headers });
  } catch (error) {
    const { code, status } = pilotWorkspaceFailure(error);
    return NextResponse.json({ code }, { status, headers });
  }
}
