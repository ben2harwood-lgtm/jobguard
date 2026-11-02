/** In-process fictional issuer. No sockets, vendor calls or persistent keys. */
import { generateKeyPairSync, randomUUID, sign, createHash } from "node:crypto";
import type { CustomFetch } from "openid-client";

export const fixtureConfig = {
  version: "oidc-config.v1", mode: "synthetic_demo", provider: "in-process-test-idp",
  tenantId: "11111111-1111-4111-8111-111111111111", connectionId: "22222222-2222-4222-8222-222222222222",
  issuer: "https://issuer.invalid", clientId: "jobguard-practice", redirectUri: "https://app.invalid/oidc/callback",
} as const;
export class TestOidcIssuer {
  private key = generateKeyPairSync("rsa", { modulusLength: 2048 });
  private kid = randomUUID();
  readonly calls: string[] = [];
  claims: Record<string, unknown> = {};
  discovery: Record<string, unknown> = {};
  unsigned = false;
  altered = false;
  unknownKey = false;
  private grants = new Map<string, URLSearchParams>();
  rotate(): void { this.key = generateKeyPairSync("rsa", { modulusLength: 2048 }); this.kid = randomUUID(); }
  authorize(url: string): string {
    const params = new URL(url).searchParams;
    const code = randomUUID();
    this.grants.set(code, params);
    const callback = new URL(fixtureConfig.redirectUri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", params.get("state")!);
    callback.searchParams.set("iss", fixtureConfig.issuer);
    return callback.href;
  }
  readonly transport: CustomFetch = async (url, options) => {
    this.calls.push(url);
    if (url === `${fixtureConfig.issuer}/.well-known/openid-configuration`) return Response.json({
      issuer: fixtureConfig.issuer, authorization_endpoint: `${fixtureConfig.issuer}/authorize`,
      token_endpoint: `${fixtureConfig.issuer}/token`, jwks_uri: `${fixtureConfig.issuer}/jwks`,
      response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"], ...this.discovery,
    });
    if (url === `${fixtureConfig.issuer}/jwks`) return Response.json({ keys: [{ ...this.key.publicKey.export({ format: "jwk" }), kid: this.kid, alg: "RS256", use: "sig" }] });
    if (url !== `${fixtureConfig.issuer}/token`) throw new Error("Unregistered fixture URL");
    const body = new URLSearchParams(String(options.body));
    const code = body.get("code")!;
    const request = this.grants.get(code);
    this.grants.delete(code);
    if (!request || body.get("grant_type") !== "authorization_code" || body.get("client_id") !== fixtureConfig.clientId ||
      body.get("redirect_uri") !== fixtureConfig.redirectUri || request.get("code_challenge_method") !== "S256" ||
      createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url") !== request.get("code_challenge")) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: this.unsigned ? "none" : "RS256", kid: this.unknownKey ? "unknown" : this.kid })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: fixtureConfig.issuer, aud: fixtureConfig.clientId, sub: "fictional-person", email: "person@builder.invalid", email_verified: true, groups: ["site"], iat: now, exp: now + 120, nonce: request.get("nonce"), ...this.claims })).toString("base64url");
    const input = `${header}.${payload}`;
    const signature = this.unsigned ? "" : sign("RSA-SHA256", Buffer.from(input), this.key.privateKey).toString("base64url");
    const token = `${input}.${signature}`;
    return Response.json({ access_token: "fictional-unused-access-token", token_type: "Bearer", id_token: this.altered ? `${token.slice(0, -8)}AAAAAAAA` : token });
  };
}
