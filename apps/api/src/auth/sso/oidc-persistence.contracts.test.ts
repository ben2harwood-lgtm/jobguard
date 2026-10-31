import { describe, expect, it } from "vitest";
import { oidcConnectionV1, oidcStartV1, oidcCallbackV1 } from "./oidc-persistence.contracts.js";
import { fixtureConfig } from "./test-oidc-issuer.js";
const connection = {version:"oidc-connection.v1",protocol:"oidc",revision:1,sessionLimitSeconds:900,config:fixtureConfig};
describe("OIDC persistence boundary",()=>{
 it("accepts only the registered synthetic destination",()=>{
  expect(oidcConnectionV1.parse(connection)).toEqual(connection);
  for(const config of [{...fixtureConfig,mode:"production"},{...fixtureConfig,issuer:"https://other.invalid"},{...fixtureConfig,redirectUri:"https://app.invalid/other"},{...fixtureConfig,clientId:"other"}])expect(oidcConnectionV1.safeParse({...connection,config}).success).toBe(false);
 });
 it("rejects protocol, revision and lifetime substitution",()=>{
  for(const change of [{protocol:"saml2"},{revision:0},{sessionLimitSeconds:901},{version:"oidc-connection.v2"},{verifier:"secret"}])expect(oidcConnectionV1.safeParse({...connection,...change}).success).toBe(false);
 });
 it("has strict versioned HTTP inputs without trusted request material",()=>{
  expect(oidcStartV1.parse({version:"oidc-start.v1",action:"signin",linkExisting:false})).toBeDefined();
  expect(oidcStartV1.safeParse({version:"oidc-start.v1",action:"signin",tenantId:fixtureConfig.tenantId}).success).toBe(false);
  expect(oidcCallbackV1.safeParse({version:"oidc-callback.v1",callback:"x",verifier:"x"}).success).toBe(false);
 });
});
