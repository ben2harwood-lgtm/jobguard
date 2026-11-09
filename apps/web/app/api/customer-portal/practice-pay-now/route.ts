import { CustomerRefused, customerRefusal } from "@jobguard/api/identity";
import { payNowAttemptApplication } from "../../../lib/pay-now-attempt-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") return Response.json({ code: "NOT_FOUND" }, { status: 404, headers });
  try {
    // No request locators, including invoice IDs, are accepted.
    if (new URL(request.url).search || request.headers.has("x-tenant-id")) throw new CustomerRefused();
    return Response.json(await payNowAttemptApplication().customerPractice({ headers: Object.fromEntries(request.headers.entries()) }), { headers });
  } catch (error) {
    const failure = customerRefusal(error);
    return Response.json(failure.body, { status: failure.status, headers });
  }
}
