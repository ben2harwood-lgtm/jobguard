import "server-only";
import { NextResponse } from "next/server";
import { auditExportHttpFailure, assertAuditExportMode } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../lib/workspace-server";
import { isTrustedBrowserOrigin } from "../origin";
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = auditExportHttpFailure(error); return NextResponse.json(body, { status, headers }); };
export async function GET(request: Request) {
  if ([...new URL(request.url).searchParams].length) return NextResponse.json({ version: "audit-export-error.v1", code: "AUDIT_EXPORT_INVALID_INPUT" }, { status: 400, headers });
  try { assertAuditExportMode(); return NextResponse.json(await (await workspaceApplication()).auditExports.list(), { headers }); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request)) return NextResponse.json({ version: "audit-export-error.v1", code: "AUDIT_EXPORT_FORBIDDEN" }, { status: 403, headers });
  try { assertAuditExportMode(); return NextResponse.json(await (await workspaceApplication()).auditExports.create(await request.json()), { headers }); } catch (error) { return failure(error); }
}
