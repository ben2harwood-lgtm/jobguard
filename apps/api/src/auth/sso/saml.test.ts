import { beforeAll, describe, expect, it } from "vitest";
import type { CacheItem, CacheProvider } from "@node-saml/node-saml";
import { SamlAdapter, SamlValidationError, type SamlConnection } from "./saml.js";
import { generateTestIdentityProvider, type TestResponseOptions } from "./test-identity-provider.js";

/** An injected cache only for unit tests; application cache must be database-backed. */
class TestRequestCache implements CacheProvider {
  readonly entries = new Map<string, string>();
  async saveAsync(key: string, value: string): Promise<CacheItem> { this.entries.set(key, value); return { value, createdAt: Date.now() }; }
  async getAsync(key: string): Promise<string | null> { return this.entries.get(key) ?? null; }
  async removeAsync(key: string | null): Promise<string | null> { if (key === null) return null; const value = this.entries.get(key) ?? null; this.entries.delete(key); return value; }
}

describe("ENT-10a strict SAML adapter (DW1)", () => {
  let idp: ReturnType<typeof generateTestIdentityProvider>;
  let untrustedIdp: ReturnType<typeof generateTestIdentityProvider>;
  let connection: SamlConnection;
  beforeAll(() => {
    idp = generateTestIdentityProvider();
    untrustedIdp = generateTestIdentityProvider();
    connection = { id: "connection-a", tenantId: "tenant-a", idpEntityId: "urn:jobguard:synthetic-idp", spEntityId: "urn:jobguard:sp:a", callbackUrl: "https://synthetic.invalid/api/auth/sso/connection-a/callback", entryPoint: "https://synthetic.invalid/test-idp", idpCert: idp.idpCert };
  });
  async function initiated() {
    const cache = new TestRequestCache();
    const adapter = new SamlAdapter(connection, cache);
    const redirect = await adapter.start();
    expect(new URL(redirect).searchParams.get("SAMLRequest")).toBeTruthy();
    const requestId = [...cache.entries.keys()][0]!;
    return { adapter, requestId, cache };
  }
  async function refused(overrides: Partial<TestResponseOptions>) {
    const { adapter, requestId } = await initiated();
    await expect(adapter.validate(idp.response({ connection, requestId, ...overrides }))).rejects.toMatchObject({ name: "SamlValidationError", code: "SAML_REFUSED" });
  }
  it("returns only verified subject, email, groups and assertion/request identities", async () => {
    const { adapter, requestId } = await initiated();
    await expect(adapter.validate(idp.response({ connection, requestId, assertionId: "_assertion-a", subject: "operative-1", groups: ["site", "crew"] }))).resolves.toEqual({ assertionId: "_assertion-a", requestId, subject: "operative-1", email: "operative@synthetic.invalid", groups: ["site", "crew"] });
  });
  it("refuses a replayed solicited response", async () => {
    const { adapter, requestId } = await initiated();
    const response = idp.response({ connection, requestId });
    await adapter.validate(response);
    await expect(adapter.validate(response)).rejects.toBeInstanceOf(SamlValidationError);
  });
  it("refuses wrong audience", async () => { await refused({ audience: "urn:other:sp" }); });
  it("requires the verified assertion issuer to equal the connection issuer (gap 1)", async () => { await refused({ issuer: "urn:other:idp" }); });
  it("requires the verified SubjectConfirmationData Recipient to equal this callback (gap 2)", async () => { await refused({ recipient: "https://synthetic.invalid/other-callback" }); });
  it.each(["notBefore", "notOnOrAfter"] as const)("requires Conditions %s even when library accepts its absence (gap 3)", async (field) => { await refused({ [field]: null }); });
  it("requires signed SubjectConfirmationData InResponseTo (gap 4)", async () => { await refused({ confirmationRequestId: null }); });
  it.each(["assertionSignatureAlgorithm", "assertionDigestAlgorithm", "responseSignatureAlgorithm", "responseDigestAlgorithm"] as const)("refuses SHA-1 in %s (gap 5)", async (field) => { await refused({ [field]: "sha1" }); });
  it("refuses entity-encoded SHA-1 Algorithm attributes without decoding XML ourselves", async () => {
    const { adapter, requestId } = await initiated();
    const signed = idp.response({ connection, requestId, responseSignatureAlgorithm: "sha1", responseDigestAlgorithm: "sha1" });
    const xml = Buffer.from(signed, "base64").toString().replaceAll("sha1", "sha&#49;");
    await expect(adapter.validate(Buffer.from(xml).toString("base64"))).rejects.toBeInstanceOf(SamlValidationError);
  });
  it("refuses expired conditions", async () => { await refused({ notOnOrAfter: new Date(Date.now() - 60_000).toISOString() }); });
  it("refuses assertions not yet valid", async () => { await refused({ notBefore: new Date(Date.now() + 120_000).toISOString() }); });
  it("bounds assertion age even with unexpired Conditions", async () => { await refused({ issueInstant: new Date(Date.now() - 900_000).toISOString() }); });
  it("refuses an unknown issued request identity", async () => { await refused({ requestId: "_never-issued" }); });
  it("refuses a subject confirmation for a different request", async () => { await refused({ confirmationRequestId: "_other-request" }); });
  it("refuses every unsolicited response, including a wrong-tenant IdP initiation", async () => {
    const adapter = new SamlAdapter(connection, new TestRequestCache());
    await expect(adapter.validate(idp.response({ connection }))).rejects.toBeInstanceOf(SamlValidationError);
  });
  it("refuses a solicited connection A response posted to connection B", async () => {
    const { requestId, cache } = await initiated();
    const otherConnection = { ...connection, id: "connection-b", tenantId: "tenant-b", spEntityId: "urn:jobguard:sp:b", callbackUrl: "https://synthetic.invalid/api/auth/sso/connection-b/callback" };
    // Sharing the cache is deliberately hostile: audience and Recipient must still bind the response.
    await expect(new SamlAdapter(otherConnection, cache).validate(idp.response({ connection, requestId }))).rejects.toBeInstanceOf(SamlValidationError);
  });
  it.each([{ signAssertion: false }, { signResponse: false }, { signAssertion: false, signResponse: false }])("refuses unsigned assertion/response %#", async (options) => { await refused(options); });
  it("refuses an assertion signed with an untrusted key", async () => {
    const { adapter, requestId } = await initiated();
    await expect(adapter.validate(untrustedIdp.response({ connection, requestId }))).rejects.toBeInstanceOf(SamlValidationError);
  });
  it("refuses alteration after signing", async () => {
    const { adapter, requestId } = await initiated();
    const xml = Buffer.from(idp.response({ connection, requestId }), "base64").toString().replace("operative@synthetic.invalid", "attacker@synthetic.invalid");
    await expect(adapter.validate(Buffer.from(xml).toString("base64"))).rejects.toBeInstanceOf(SamlValidationError);
  });
  it("refuses a missing assertion identity", async () => { await refused({ assertionId: "" }); });
  it("returns a typed refusal for malformed SAML", async () => {
    const { adapter } = await initiated();
    await expect(adapter.validate("not a SAML response")).rejects.toBeInstanceOf(SamlValidationError);
  });
});
