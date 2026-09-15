import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { Pool } from "pg";
import { CaptureRepository } from "@jobguard/db";
import { CaptureController } from "./capture/capture.controller.js";
import { CaptureService } from "./capture/capture.service.js";
import { WorkspaceController } from "./workspace/workspace.controller.js";
import { WorkspaceService } from "./workspace/workspace.service.js";

@Module({ controllers: [HealthController,CaptureController,WorkspaceController], providers:[{provide:Pool,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL})},{provide:CaptureRepository,useFactory:(pool:Pool)=>new CaptureRepository(pool),inject:[Pool]},{provide:WorkspaceService,useFactory:(pool:Pool)=>new WorkspaceService(pool),inject:[Pool]},CaptureService] })
export class AppModule {}
