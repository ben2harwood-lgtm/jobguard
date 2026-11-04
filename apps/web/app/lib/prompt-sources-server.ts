import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { materialsIssueBodyV1, completionObservationBodyV1, evaluateLivePromptsV1, EnterpriseLivePromptPersistenceError } from "@jobguard/core";
import { EnterpriseLivePromptRepository } from "@jobguard/db";
import { syntheticPool } from "./synthetic-server";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";

type Action = "materials" | "observations" | "evaluate";
const uuid = z.guid();
const count = z.number().int().nonnegative();
const evaluation = z.object({ promptIds: z.array(uuid), quarantinedComparisons: count, unevaluatedComparisons: count });
const schemas = {
  materials: materialsIssueBodyV1,
  observations: completionObservationBodyV1,
  evaluate: evaluateLivePromptsV1.omit({ jobId: true }),
};
// Project only the existing command answers; unexpected repository fields never reach the browser.
const answers = {
  materials: z.object({ sourceId: uuid, quarantinedComparisons: count, unevaluatedComparisons: count }),
  observations: z.object({ observationId: uuid, evaluation }),
  evaluate: evaluation,
};
class BoundaryError extends Error {
  constructor(readonly code: string) { super(code); }
}
function failure(error: unknown) {
  const code = error instanceof BoundaryError || error instanceof EnterpriseLivePromptPersistenceError
    ? error.code : (error as { code?: string } | null)?.code;
  if (code === "EXTRA_FORBIDDEN" || code === "NOT_FOUND") return { code: "NOT_FOUND", status: 404 };
  if (code === "UNAUTHENTICATED") return { code, status: 401 };
  if (["MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "PROMPT_PRACTICE_ONLY"].includes(code ?? "")) return { code, status: 403 };
  if (code === "INVALID_PROMPT_COMMAND") return { code, status: 400 };
  if (["JOB_NOT_LIVE", "PROMPT_CONFLICT", "PROMPT_SOURCE_INVALID", "PROMPT_AMBIGUOUS", "PROMPT_ORIGIN_HELD"].includes(code ?? "")) return { code, status: 409 };
  return { code: "PROMPT_UNAVAILABLE", status: 503 };
}
/** Browser transport only. Checked repository routines retain role, grant, source and replay authority. */
export async function promptSourcesResponse(request: Request, params: Promise<{ id: string }>, action: Action) {
  const headers = { "cache-control": "no-store" };
  try {
    if (!isTrustedBrowserOrigin(request)) throw new BoundaryError("ORIGIN_FORBIDDEN");
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new BoundaryError("MODE_FORBIDDEN");
    const session = (await cookies()).get("jg_session")?.value;
    if (!uuid.safeParse(session).success) throw new BoundaryError("UNAUTHENTICATED");
    const { id } = await params;
    if (!uuid.safeParse(id).success) throw new BoundaryError("INVALID_PROMPT_COMMAND");
    let raw: unknown;
    try { raw = await request.json(); } catch { throw new BoundaryError("INVALID_PROMPT_COMMAND"); }
    const parsed = schemas[action].safeParse(raw);
    if (!parsed.success) throw new BoundaryError("INVALID_PROMPT_COMMAND");
    const input = { ...parsed.data, jobId: id };
    const repository = new EnterpriseLivePromptRepository(syntheticPool());
    const result = action === "materials" ? await repository.importMaterials(session!, input)
      : action === "observations" ? await repository.registerObservation(session!, input)
      : await repository.evaluate(session!, input);
    return NextResponse.json(answers[action].parse(result), { status: 201, headers });
  } catch (error) {
    const { code, status } = failure(error);
    return NextResponse.json({ version: "enterprise-live-prompt-error.v1", code }, { status, headers });
  }
}
