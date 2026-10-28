import "server-only";
import { MeterTodayApplication } from "@jobguard/api/workspace";
import { MeterTodayRepository } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";

export function meterApplication() { return new MeterTodayApplication(identityApplication(), new MeterTodayRepository(syntheticPool())); }
