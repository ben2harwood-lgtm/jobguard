import "server-only";
import { SmallBuilderDemoApplication, subscriptionAuthority } from "@jobguard/api/workspace";
import { SmallBuilderDemoRepository } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
export function smallBuilderDemoApplication() {
  return new SmallBuilderDemoApplication(subscriptionAuthority(identityApplication()), new SmallBuilderDemoRepository(syntheticPool()));
}
