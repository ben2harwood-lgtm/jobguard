import { Module, Injectable, UnauthorizedException, type DynamicModule, type ExecutionContext } from "@nestjs/common";
import { machineRegistrationEnabled } from "@jobguard/config";
import { Pool } from "pg";
import { ApplicationAuthGuard } from "../auth/application-auth.guard.js";
import { createIdentityApplication } from "../auth/identity.application.js";
import { FakeMachineSecretStore, type MachineFixtureSecrets } from "./fake-secret-store.js";
import { FictionalMachineController, FICTIONAL_MACHINE_CONNECTION } from "./machine.controller.js";
import { FictionalMachineManagement } from "./machine-management.js";
import { FictionalMachineConnection, MACHINE_PATH, PostgresMachineStore } from "./machine.js";
export { machineRegistrationEnabled } from "@jobguard/config";

/** Only the exact registered machine route delegates to machine authentication. */
@Injectable()
export class MachineApplicationAuthGuard extends ApplicationAuthGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ path: string; originalUrl: string; method: string; headers: Record<string, unknown> }>();
    if (request.path !== MACHINE_PATH) return super.canActivate(context);
    if (!machineRegistrationEnabled(process.env) || request.method !== "POST" || request.originalUrl !== MACHINE_PATH ||
        request.headers.cookie !== undefined || request.headers.authorization !== undefined ||
        typeof request.headers["x-connector-machine"] !== "string")
      throw new UnauthorizedException({ code: "UNAUTHENTICATED" });
    // Controller and connection verify the full signature and persisted authority before staging.
    return true;
  }
}

class MachinePool extends Pool {
  async onModuleDestroy() { await this.end(); }
}
const MACHINE_POOL = "CONNECTOR_MACHINE_POOL";
const MANAGEMENT_POOL = "CONNECTOR_MACHINE_MANAGEMENT_POOL";
@Module({})
export class MachineModule {
  static register(environment: unknown, fixtures: MachineFixtureSecrets): DynamicModule {
    if (!machineRegistrationEnabled(environment)) return { module: MachineModule };
    const secrets = new FakeMachineSecretStore(fixtures);
    return {
      module: MachineModule,
      controllers: [FictionalMachineController],
      providers: [
        { provide: MACHINE_POOL, useFactory: () => new MachinePool({ connectionString: process.env.DATABASE_URL, max: 2, options: "-c role=jobguard_machine" }) },
        { provide: MANAGEMENT_POOL, useFactory: () => new MachinePool({ connectionString: process.env.DATABASE_URL, max: 2 }) },
        { provide: FICTIONAL_MACHINE_CONNECTION, useFactory: (pool: Pool) => new FictionalMachineConnection(new PostgresMachineStore(pool), secrets), inject: [MACHINE_POOL] },
        { provide: FictionalMachineManagement, useFactory: (pool: Pool) => new FictionalMachineManagement(createIdentityApplication(process.env), pool), inject: [MANAGEMENT_POOL] },
      ],
      exports: [FictionalMachineManagement],
    };
  }
}
