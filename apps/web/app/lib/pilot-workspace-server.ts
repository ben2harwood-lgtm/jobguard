import "server-only";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { createPilotWorkspaceApplication, pilotWorkspaceFailure, requirePilotG1 } from "@jobguard/api/workspace";
import { AuthError } from "@jobguard/api/identity";
import { identityApplication, identityCredentials } from "./identity-server";
import { jobsResponseV1, tenantIdV1 } from "./contracts";

const poolRegistry = globalThis as typeof globalThis & { __jobguardPilotPool?: Pool };

function pilotPool(): Pool {
  const connectionString = process.env.PILOT_RUNTIME_DATABASE_URL;
  const url = new URL(connectionString ?? "");
  if (!/^postgres(?:ql)?:$/u.test(url.protocol) || decodeURIComponent(url.username) !== "jobguard_runtime") {
    throw new Error("Pilot requires the non-owner runtime credential");
  }
  if (process.env.JOBGUARD_HOSTING === "cloudflare") {
    return new Pool({ connectionString, max: 1, maxUses: 1, application_name: "jobguard-pilot-web" });
  }
  return poolRegistry.__jobguardPilotPool ??= new Pool({ connectionString, max: 4, application_name: "jobguard-pilot-web" });
}

export async function pilotWorkspaceApplication(request: NextRequest, requestedTenantId: string) {
  requirePilotG1(process.env);
  // The presence of a practice credential is a refusal, regardless of other cookies.
  if ((await cookies()).get("jg_session")) {
    throw new AuthError("UNAUTHENTICATED");
  }
  const credentials = await identityCredentials(request);
  return createPilotWorkspaceApplication({ pool: pilotPool(), identity: identityApplication() }, { ...credentials, requestedTenantId });
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
