import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { EnterpriseLivePromptApplication, enterpriseLivePromptHttpFailure, PromptBoundaryError } from "../../../api/src/contractor/enterprise-live-prompt.application";
import { syntheticPool } from "./synthetic-server";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";

type Action = "list" | "detail" | "confirm" | "dismiss";
/** Transport only: the existing application and checked routines retain all authority. */
export async function possibleExtrasResponse(request: Request, params: Promise<{ id: string; promptId?: string }>, action: Action) {
  const headers = { "cache-control": "no-store" };
  try {
    const mutation = action === "confirm" || action === "dismiss";
    if (mutation && !isTrustedBrowserOrigin(request)) throw new PromptBoundaryError("ORIGIN_FORBIDDEN");
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PromptBoundaryError("MODE_FORBIDDEN");
    const { id, promptId } = await params;
    const principal = { version: "contractor-principal.v1", sessionId: (await cookies()).get("jg_session")?.value };
    const app = new EnterpriseLivePromptApplication(syntheticPool());
    let result: unknown;
    if (action === "list") result = await app.list(principal, id, Object.fromEntries(new URL(request.url).searchParams));
    else if (action === "detail") result = await app.detail(principal, id, promptId!);
    else {
      let body: unknown;
      try { body = await request.json(); } catch { throw new PromptBoundaryError("INVALID_PROMPT_COMMAND"); }
      result = await app[action](principal, id, promptId!, body);
    }
    return NextResponse.json(result, { status: mutation ? 201 : 200, headers });
  } catch (error) {
    const failure = enterpriseLivePromptHttpFailure(error);
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
