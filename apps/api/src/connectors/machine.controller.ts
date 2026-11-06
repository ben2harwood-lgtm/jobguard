import { Controller, Post, Req, Inject, HttpException } from "@nestjs/common";
import { FictionalMachineConnection, MACHINE_PATH } from "./machine.js";
export const FICTIONAL_MACHINE_CONNECTION = "FICTIONAL_MACHINE_CONNECTION";
/** Intentionally absent from AppModule and OpenAPI. A future reviewed composition must
 * supply raw bytes and this exact route; never a global member-auth bypass. */
@Controller("connectors/machine")
export class FictionalMachineController {
  constructor(@Inject(FICTIONAL_MACHINE_CONNECTION) private readonly connection: FictionalMachineConnection) {}
  @Post("intake")
  async intake(@Req() request: { method: string; originalUrl: string; headers: Record<string, unknown>; rawBody?: Uint8Array }) {
    try {
      if (request.originalUrl !== MACHINE_PATH || !request.rawBody) throw new Error();
      const header = request.headers["x-connector-machine"];
      if (typeof header !== "string") throw new Error();
      return await this.connection.receive(request.method, request.originalUrl, JSON.parse(header), request.rawBody);
    } catch { throw new HttpException({ code: "CONNECTOR_INPUT_REFUSED" }, 401); }
  }
}
