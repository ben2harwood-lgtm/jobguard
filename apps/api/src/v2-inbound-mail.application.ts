import type { Pool } from "pg";
import { V2InboundMailRepository, requireV2Inbound } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";

export class V2InboundMailApplication {
 private readonly access: PracticeAccess;
 private readonly repository: V2InboundMailRepository;
 constructor(pool: Pool, sessionId?: string) {
  this.access = new PracticeAccess(pool,sessionId);
  this.repository = new V2InboundMailRepository(pool);
 }
 private async principal() { requireV2Inbound(); return this.access.session(); }
 async view() { return this.repository.view(await this.principal()); }
 async address(raw: unknown) { return this.repository.address(await this.principal(),raw); }
 async receive(raw: unknown) { return this.repository.receive(await this.principal(),raw); }
 async command(raw: unknown) { return this.repository.command(await this.principal(),raw); }
}
