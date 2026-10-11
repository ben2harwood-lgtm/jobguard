import { describe,expect,it } from "vitest";
import { ssoAdminV1,ssoCallbackV1,ssoMetadataV1,syntheticSsoMetadata } from "./sso.contracts.js";
import { generateTestIdentityProvider } from "./test-identity-provider.js";
const id="00000000-0000-4000-8000-000000000001",tenant="00000000-0000-4000-8000-000000000002";
const idpCert=generateTestIdentityProvider().idpCert;
describe("ENT-10a identity input boundaries",()=>{
 it("requires every provider-data-flow field and a versioned strict metadata record",()=>{
  const metadata=syntheticSsoMetadata(id,tenant,idpCert,"https://jg.invalid");
  expect(ssoMetadataV1.parse(metadata)).toEqual(metadata);
  for(const key of Object.keys(metadata.dataFlow)) {const changed=structuredClone(metadata);delete (changed.dataFlow as Record<string,unknown>)[key];expect(ssoMetadataV1.safeParse(changed).success,key).toBe(false);}
  expect(ssoMetadataV1.safeParse({...metadata,unexpectedField:"https://live.invalid"}).success).toBe(false);
 });
 it("cannot accept a real domain, invented verification, arbitrary provider or client role on a sign-in",()=>{
  const raw={version:"sso-admin.v1",requested_tenant_id:tenant,action:"domain.verify",connectionId:id,domain:"live.example",proof:"client-assertion"};
  expect(ssoAdminV1.safeParse(raw).success).toBe(false);
  expect(ssoCallbackV1.safeParse({version:"sso-callback.v1",SAMLResponse:"QQ==",relayState:"A".repeat(43),tenantId:tenant,role:"finance"}).success).toBe(false);
 });
});
