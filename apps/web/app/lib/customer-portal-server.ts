import { assertPilotConnection } from "@jobguard/db";
import { CustomerRefused, customerRefusal, customerSessionCookie, requirePilotG1, requirePilotResources, type IdentityApplication } from "@jobguard/api/identity";
import { identityApplication, pilotIdentityApplication } from "./identity-server";

export async function customerPortalRequest(
  request: Request,
  handle: (identity: () => IdentityApplication) => Promise<Response>,
  clearCookie = false,
) {
  if (process.env.JOBGUARD_ENV !== "pilot_no_charge") return handle(identityApplication);
  const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (clearCookie) headers.set("Set-Cookie", `${customerSessionCookie()}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  try {
    try { requirePilotG1(process.env); }
    catch { throw new CustomerRefused(); }
    const resources = requirePilotResources(process.env, "web");
    if (new URL(request.url).origin !== resources.webOrigin || request.headers.get("origin") !== resources.webOrigin) {
      throw new CustomerRefused();
    }
    const application = pilotIdentityApplication();
    const pool = application.provider.repository.pool;
    try {
      await assertPilotConnection(pool, resources.identity);
      return await handle(() => application);
    } finally {
      if (process.env.JOBGUARD_HOSTING === "cloudflare") await pool.end();
    }
  } catch (error) {
    const failure = customerRefusal(error);
    return Response.json(failure.body, { status: failure.status, headers });
  }
}
