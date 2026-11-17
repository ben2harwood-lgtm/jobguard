import { NextResponse } from "next/server";
import { CommandError, IMPORT_CATCH_HOLD_REASON } from "@jobguard/db";
import { ImportContractError } from "@jobguard/core";
import { JobImportV3Error } from "@jobguard/api/workspace";
import { practiceFailure } from "./synthetic-server";

export function importV3Failure(error: unknown) {
  const denied = practiceFailure(error);
  if (denied) return denied;
  const code = error instanceof JobImportV3Error || error instanceof CommandError || error instanceof ImportContractError
    ? error.code : "DATABASE_UNAVAILABLE";
  return NextResponse.json({ code, ...(code === "ATTRIBUTION_UNAVAILABLE" ? { reason: IMPORT_CATCH_HOLD_REASON } : {}) }, { status: code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404
    : code === "INVALID_IMPORT" || code === "INVALID_IMPORT_CONTRACT" ? 400 : code === "DATABASE_UNAVAILABLE" ? 503 : 409, headers: { "Cache-Control": "no-store" } });
}
