import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { EnterpriseFeeError, enterpriseFeePublicError } from "@jobguard/core";
import { EnterpriseFeeRepository, contractorSessionContext } from "@jobguard/db";
import { syntheticPool } from "../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../origin";
const headers = { "cache-control": "no-store" };
const readV1 = z.object({ version: z.literal("enterprise-fee-screen-read.v1"), statementId: z.guid() }).strict();
/** Thin synthetic transport. The existing SQL entrypoints recheck finance scope and exact authority on every call. */
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new EnterpriseFeeError("SYNTHETIC_REFERENCE_FORBIDDEN");
    if (!isTrustedBrowserOrigin(request)) throw new EnterpriseFeeError("EXTRA_FORBIDDEN");
    const session = (await cookies()).get("jg_session")?.value;
    if (!session || !z.guid().safeParse(session).success) throw new EnterpriseFeeError("EXTRA_FORBIDDEN");
    const raw: unknown = await request.json().catch(() => { throw new EnterpriseFeeError("INVALID_FEE_INPUT"); });
    const { action } = await context.params;
    if (!["derive", "prepare", "read", "approve", "post", "dispute"].includes(action)) throw new EnterpriseFeeError("INVALID_FEE_INPUT");
    const pool = syntheticPool(), tenant = await contractorSessionContext(pool, session), repo = new EnterpriseFeeRepository(pool);
    let result: unknown;
    if (action === "read") {
      const input = readV1.safeParse(raw);
      if (!input.success) throw new EnterpriseFeeError("INVALID_FEE_INPUT");
      const statement = await repo.readStatement(tenant, session, input.data.statementId);
      const [derivations, postings] = await Promise.all([
        Promise.all(statement.sections.map(s => repo.read(tenant, session, s.derivationId))), repo.readPostings(tenant, session, statement.id),
      ]);
      result = { statement, derivations, postings };
    } else if (action === "derive") result = await repo.derive(tenant, session, raw);
    else if (action === "prepare") result = await repo.prepareStatement(tenant, session, raw);
    else if (action === "approve") result = await repo.approveStatement(tenant, session, raw);
    else if (action === "post") result = await repo.postStatement(tenant, session, raw);
    else result = await repo.disputeStatement(tenant, session, raw);
    return NextResponse.json(result, { headers });
  } catch (error) {
    const known = error instanceof EnterpriseFeeError ? error : new EnterpriseFeeError("OUTCOME_UNKNOWN");
    const failure = enterpriseFeePublicError(known);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
