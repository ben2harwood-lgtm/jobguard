import { expect, it, vi } from "vitest";
import { MemoryAuthProvider, type TenantRequestCredentials } from "@jobguard/api/identity";
import { SubscriptionApplication } from "@jobguard/api/workspace";
import { subscriptionPersistedReadV1, type VerifiedTenantContext } from "@jobguard/db";
import { loadSubscriptionPlan } from "./plan-screen";

const state = vi.hoisted(() => ({ token: "", application: null as SubscriptionApplication | null }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "jobguard_session" ? { value: state.token } : undefined }) }));
vi.mock("../lib/identity-server", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/identity-server")>(),
  identityApplication: () => ({ allowedOrigin: "https://fictional.invalid" }),
}));
vi.mock("../lib/subscription-server", () => ({ subscriptionApplication: () => state.application! }));
import { GET } from "../api/subscriptions/current/route";

it("passes the screen's actual Request headers through C1's real credential reader and company authorization", async () => {
  // Existing provider-free email-code helper: no authentication/CSRF/membership checks are stubbed.
  const provider = new MemoryAuthProvider("fictional-test-secret", () => {}, Date.now, () => "12345678");
  await provider.requestCode({ email: "owner@practice.invalid", purpose: "signup", ip: "fixture" });
  const signedIn = await provider.verifyCode("owner@practice.invalid", "signup", "12345678");
  state.token = signedIn.sessionToken;
  const membership = provider.fixtureMemberships()[0]!;
  const body = subscriptionPersistedReadV1.parse({ version: "subscription-persisted-read.v1", hypothetical: true, environment: "synthetic_demo",
    agreements: [{ tenant_id: membership.tenantId, id: membership.id, revision: 1, plan: "Builder", cadence: "monthly",
      anchor_day: 1, maximum_pence: 16900, effective_date: "2000-01-01" }],
    changes: [], changeOutcomes: [], periods: [], statements: [], reviews: [], work: [], attempts: [], results: [],
    corrections: [], alerts: [], onboarding: [], periodLines: [], placeBindings: [], places: [], statementLines: [], operationsCards: [],
  });
  const read = vi.fn(async (_context: VerifiedTenantContext) => body);
  state.application = new SubscriptionApplication({ environment: () => "synthetic_demo", allowedOrigin: "https://fictional.invalid", provider,
    resolve: async handle => ({ credentials: handle as TenantRequestCredentials, digest: "a".repeat(64) }),
  }, { read, command: vi.fn() });
  const requests: Request[] = [];
  let omit = "";
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(new URL(String(input), "https://fictional.invalid"), init);
    if (request.url.endsWith("/api/auth/session")) return Response.json({ csrfToken: signedIn.csrfToken, memberships: [membership] });
    requests.push(request);
    if (omit) request.headers.delete(omit);
    return GET(request);
  };
  expect((await loadSubscriptionPlan(transport)).agreement?.plan).toBe("Builder");
  expect(requests[0]!.headers.get("x-csrf-token")).toBe(signedIn.csrfToken);
  expect(requests[0]!.headers.get("x-tenant-id")).toBe(membership.tenantId);
  expect(read).toHaveBeenCalledOnce();
  expect(read.mock.calls[0]![0]).toMatchObject({ tenantId: membership.tenantId });
  // Removing either real header must prevent the repository read, not produce a stubbed success.
  for (const header of ["x-csrf-token", "x-tenant-id"]) {
    omit = header;
    await expect(loadSubscriptionPlan(transport)).rejects.toThrow();
    expect(read).toHaveBeenCalledOnce();
  }
});
