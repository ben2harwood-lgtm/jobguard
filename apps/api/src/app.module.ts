import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { Pool } from "pg";
import { CaptureRepository } from "@jobguard/db";
import { CaptureController } from "./capture/capture.controller.js";
import { CaptureService } from "./capture/capture.service.js";

@Module({ controllers: [HealthController,CaptureController], providers:[{provide:Pool,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL})},{provide:CaptureRepository,useFactory:(pool:Pool)=>new CaptureRepository(pool),inject:[Pool]},CaptureService] })
export class AppModule {}
