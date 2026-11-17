import { generateKeyPairSync, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { parseDomFromString, signXml, validateSignature, xpath } from "@node-saml/node-saml/lib/xml.js";
import type { CacheItem, CacheProvider } from "@node-saml/node-saml";
import { SamlAdapter, type SamlConnection } from "./saml.js";
import { generateTestIdentityProvider } from "./test-identity-provider.js";

class RequestCache implements CacheProvider {
  readonly entries = new Map<string, string>();
  async saveAsync(key: string, value: string): Promise<CacheItem> {
    this.entries.set(key, value); return { value, createdAt: Date.now() };
  }
  async getAsync(key: string) { return this.entries.get(key) ?? null; }
  async removeAsync(key: string | null) {
    if (key === null) return null;
    const value = this.entries.get(key) ?? null; this.entries.delete(key); return value;
  }
}

describe("FIXLATER-6 signed assertion selection", () => {
  let idp: ReturnType<typeof generateTestIdentityProvider>;
  let connection: SamlConnection;
  let signingKey: string;
  beforeAll(() => {
    idp = generateTestIdentityProvider();
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    signingKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    connection = { id: randomUUID(), tenantId: randomUUID(), idpEntityId: "urn:jobguard:fixture:idp",
      spEntityId: "urn:jobguard:fixture:sp", callbackUrl: "https://fixture.invalid/sso/callback",
      entryPoint: "https://fixture.invalid/sso/start", idpCert: keys.publicKey.export({ type: "spki", format: "pem" }).toString() };
  });
  async function initiated() {
    const cache = new RequestCache(), adapter = new SamlAdapter(connection, cache);
    expect(new URL(await adapter.start()).searchParams.get("SAMLRequest")).toBeTruthy();
    const requestId = [...cache.entries.keys()][0]!;
    return { adapter, requestId };
  }
  const identity = { subject: "signed-operative", email: "signed@fixture.invalid", groups: ["site", "crew"] };
  function sign(xml: string, node: "Assertion" | "Response") {
    const path = node === "Response" ? "/*[local-name(.)='Response']" : "//*[local-name(.)='Assertion']";
    return signXml(xml, path, { reference: `${path}/*[local-name(.)='Issuer']`, action: "after" },
      { privateKey: signingKey, signatureAlgorithm: "sha256", digestAlgorithm: "sha256" });
  }
  function benign(requestId: string, assertionId: string) {
    return sign(Buffer.from(idp.response({ connection, requestId, assertionId, ...identity,
      signAssertion: false, signResponse: false }), "base64").toString(), "Assertion");
  }
  async function wrapping(requestId: string, duplicate: boolean) {
    const assertionId = `_${randomUUID()}`;
    const xml = benign(requestId, assertionId);
    const signed = xml.match(/<saml:Assertion\b[\s\S]*?<\/saml:Assertion>/u)![0];
    // Keep the original signed assertion byte-for-byte. A separate unsigned assertion offers different claims.
    const unsigned = Buffer.from(idp.response({ connection, requestId,
      assertionId: duplicate ? assertionId : `_${randomUUID()}`, subject: "substituted-operative",
      email: "substituted@fixture.invalid", groups: ["admin"], signAssertion: false, signResponse: false }), "base64")
      .toString().match(/<saml:Assertion\b[\s\S]*?<\/saml:Assertion>/u)![0];
    const wrapped = duplicate ? xml.replace(signed, unsigned + signed)
      : xml.replace(signed, `<samlp:Extensions>${signed}</samlp:Extensions>${unsigned}`);
    expect(wrapped).toContain(signed);
    expect(signed).toContain("<Signature");
    expect(unsigned).not.toContain("<Signature");
    expect(unsigned).toContain("substituted@fixture.invalid");
    expect(wrapped.match(/<saml:Assertion\b/gu)).toHaveLength(2);
    if (duplicate) expect(wrapped.match(new RegExp(`ID="${assertionId}"`, "gu"))).toHaveLength(2);
    else expect(wrapped).toContain(`<samlp:Extensions>${signed}</samlp:Extensions>`);
    // Sign the outer response AFTER wrapping, so refusal cannot be attributed to a stale outer signature.
    const response = sign(wrapped, "Response");
    expect(response).toContain(signed);
    const doc = await parseDomFromString(response);
    const root = xpath.selectElements(doc, "/*[local-name(.)='Response']")[0]!;
    expect(validateSignature(response, root, [connection.idpCert])).toBe(true);
    if (!duplicate) {
      const retained = xpath.selectElements(doc, "//*[local-name(.)='Extensions']/*[local-name(.)='Assertion']")[0]!;
      expect(validateSignature(response, retained, [connection.idpCert])).toBe(true);
    }
    return Buffer.from(response).toString("base64");
  }
  it("F6-SAML-1 F6-A06 a valid signed twin returns only the signed identity", async () => {
    const { adapter, requestId } = await initiated(), assertionId = `_${randomUUID()}`;
    await expect(adapter.validate(Buffer.from(sign(benign(requestId, assertionId), "Response")).toString("base64")))
      .resolves.toEqual({ ...identity, assertionId, requestId });
  });
  it("F6-SAML-2 F6-A07 a wrapped signed assertion cannot substitute unsigned identity claims", async () => {
    const { adapter, requestId } = await initiated();
    await expect(adapter.validate(await wrapping(requestId, false)))
      .rejects.toMatchObject({ name: "SamlValidationError", code: "SAML_REFUSED" });
  });
  it("F6-SAML-3 F6-A07 duplicate assertion identity wrapping is refused with SAML_REFUSED", async () => {
    const { adapter, requestId } = await initiated();
    await expect(adapter.validate(await wrapping(requestId, true)))
      .rejects.toMatchObject({ name: "SamlValidationError", code: "SAML_REFUSED" });
  });
});
