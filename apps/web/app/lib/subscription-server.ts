import "server-only";
import { SubscriptionApplication, subscriptionAuthority } from "@jobguard/api/workspace";
import { SubscriptionRepository } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
/** Real company session only: the practice cookie is never read here. */
export function subscriptionApplication() { return new SubscriptionApplication(subscriptionAuthority(identityApplication()), new SubscriptionRepository(syntheticPool())); }
