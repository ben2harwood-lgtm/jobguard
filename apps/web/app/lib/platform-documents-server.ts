import "server-only";
import { z, ZodError } from "zod";
import { NextResponse } from "next/server";
import { AuthError, resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { PlatformInvoiceReadRepository } from "@jobguard/db";
import { PLATFORM_INVOICE_WARNING, PlatformInvoiceError, platformInvoiceAccountFixture, type PlatformInvoiceDocument } from "@jobguard/core";
import { identityApplication, identityCredentials } from "./identity-server";
import { syntheticPool } from "./synthetic-server";

const headers = { "Cache-Control": "no-store" };
/** Explicit display projection: no arbitrary stored fields, bank details or hidden evidence. */
function display(document: PlatformInvoiceDocument) {
  return { number: document.number, lines: document.request.lines.map(line => {
    const p = line.provenance;
    const references = Object.entries(p).flatMap(([name, value]) => {
      if (["statement", "approval", "derivation", "proof", "finalAccountLock", "origin", "customerInvoice", "payment"].includes(name)
        && value && typeof value === "object" && "id" in value && "hash" in value)
        return [{ name, id: String(value.id), hash: String(value.hash) }];
      if (name === "priorSettlements" && Array.isArray(value))
        return value.map(ref => ({ name, id: String(ref.id), hash: String(ref.hash) }));
      return [];
    });
    return { id: line.id, kind: p.kind, policyVersion: p.policyVersion, references };
  }) };
}
export async function platformDocumentsRequest(request: Request) {
  const reply = (code: string, status: number) => NextResponse.json({ version: "platform-documents-error.v1", code }, { status, headers });
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") return reply("NOT_FOUND", 404);
  if (request.headers.has("x-tenant-id") || new URL(request.url).search) return reply("INVALID_PLATFORM_DOCUMENTS_REQUEST", 400);
  try {
    const credentials = await identityCredentials(request);
    if (!z.string().min(32).safeParse(credentials.sessionToken).success) return reply("UNAUTHENTICATED", 401);
    const identity = identityApplication();
    const session = await identity.session(credentials.sessionToken);
    if (session.memberships.length !== 1 || session.memberships[0]?.role !== "owner") return reply("PLATFORM_INVOICE_FORBIDDEN", 403);
    const membership = session.memberships[0];
    const context = await resolveVerifiedTenantContext(identity.provider, {
      sessionToken: credentials.sessionToken, requestedTenantId: membership.tenantId,
      origin: identity.allowedOrigin, csrfToken: session.csrfToken,
    }, identity.allowedOrigin);
    const digest = identity.provider.digest(`session:${credentials.sessionToken}`);
    const documents = await new PlatformInvoiceReadRepository(syntheticPool()).read(context, digest);
    return NextResponse.json({ version: "platform-documents.v1", warning: PLATFORM_INVOICE_WARNING,
      collectionStarted: false, documents: documents.map(({ invoice, credits }) => ({
        issuerId: invoice.request.issuerId, invoice: display(invoice), credits: credits.map(display),
        account: platformInvoiceAccountFixture(invoice, credits, 0),
      })),
    }, { headers });
  } catch (error) {
    if (error instanceof AuthError) return reply(error.code === "TENANT_FORBIDDEN" ? "PLATFORM_INVOICE_FORBIDDEN" : "UNAUTHENTICATED", error.code === "TENANT_FORBIDDEN" ? 403 : 401);
    if (error instanceof ZodError) return reply("UNAUTHENTICATED", 401);
    if (error instanceof PlatformInvoiceError && error.code === "PLATFORM_INVOICE_FORBIDDEN") return reply(error.code, 403);
    return reply("PLATFORM_DOCUMENTS_UNAVAILABLE", 503);
  }
}
