import { SandboxRepository, SandboxRepositoryError } from "@jobguard/db";
import { sandboxCommandV1, sandboxRunIdV1, type SandboxRunResponse } from "./contracts.js";
export class SandboxServiceError extends Error{constructor(readonly code:"UNAUTHENTICATED"|"INVALID_COMMAND"|"NOT_FOUND"|"ARCHIVED"|"COMMAND_CONFLICT"|"FORBIDDEN"){super(code)}}
export class SandboxService{
 constructor(private readonly repository:SandboxRepository){}
 private parse(sessionId:string|undefined,raw:unknown){if(!sessionId||!sandboxRunIdV1.safeParse(sessionId).success)throw new SandboxServiceError("UNAUTHENTICATED");const command=sandboxCommandV1.safeParse(raw);if(!command.success)throw new SandboxServiceError("INVALID_COMMAND");return{sessionId,command:command.data};}
 private response(run:Awaited<ReturnType<SandboxRepository["read"]>>):SandboxRunResponse{return{version:1,environment:"synthetic_demo",run};}
 async create(sessionId:string|undefined,raw:unknown){const x=this.parse(sessionId,raw);return this.response(await this.call(()=>this.repository.create(x.sessionId,x.command.commandId)));}
 async reset(sessionId:string|undefined,id:unknown,raw:unknown){const x=this.parse(sessionId,raw),runId=this.id(id);return this.response(await this.call(()=>this.repository.reset(x.sessionId,runId,x.command.commandId)));}
 async archive(sessionId:string|undefined,id:unknown,raw:unknown){const x=this.parse(sessionId,raw),runId=this.id(id);return this.response(await this.call(()=>this.repository.archive(x.sessionId,runId,x.command.commandId)));}
 async advance(sessionId:string|undefined,id:unknown,raw:unknown){const x=this.parse(sessionId,raw),runId=this.id(id);return this.response(await this.call(()=>this.repository.advance(x.sessionId,runId,x.command.commandId)));}
 async get(sessionId:string|undefined,id:unknown){if(!sessionId||!sandboxRunIdV1.safeParse(sessionId).success)throw new SandboxServiceError("UNAUTHENTICATED");return this.response(await this.call(()=>this.repository.read(sessionId,this.id(id))));}
 private id(raw:unknown){const p=sandboxRunIdV1.safeParse(raw);if(!p.success)throw new SandboxServiceError("NOT_FOUND");return p.data;}
 private async call<T>(fn:()=>Promise<T>){try{return await fn()}catch(e){if(e instanceof SandboxRepositoryError)throw new SandboxServiceError(e.code);throw e}}
}
