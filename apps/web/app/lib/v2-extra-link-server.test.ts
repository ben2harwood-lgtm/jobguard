import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@jobguard/api/workspace", () => ({ V2CustomerExtraLinkApplication: vi.fn() }));
vi.mock("@jobguard/db", () => ({ assertExtraLinkMode: vi.fn() }));
vi.mock("./synthetic-server", () => ({ syntheticPool: vi.fn() }));
import { extraLinkOrigin } from "./v2-extra-link-server";
afterEach(() => vi.unstubAllEnvs());
it.each(["http://127.0.0.1:3400", "https://192.168.1.20:3400"])(
  "accepts the launcher's configured origin %s even through an internal HTTP URL", origin => {
    vi.stubEnv("AUTH_ALLOWED_ORIGIN", origin);
    for (const path of ["/api/jobs/job/extra-links", "/api/v2/extra-links/capability"]) {
      expect(() => extraLinkOrigin(new Request("http://127.0.0.1:3400" + path,
        { method: "POST", headers: { origin } }))).not.toThrow();
    }
    for (const supplied of ["https://other.invalid", "null", ""]) {
      expect(() => extraLinkOrigin(new Request(origin, { headers: { origin: supplied,
        "x-forwarded-host": new URL(origin).host, "x-forwarded-proto": "https" } }))).toThrow("LINK_UNAVAILABLE");
    }
  });
it("refuses absent configuration even when Origin matches request.url", () => {
  vi.stubEnv("AUTH_ALLOWED_ORIGIN", "");
  expect(() => extraLinkOrigin(new Request("http://127.0.0.1:3400",
    { headers: { origin: "http://127.0.0.1:3400" } }))).toThrow("LINK_UNAVAILABLE");
});
