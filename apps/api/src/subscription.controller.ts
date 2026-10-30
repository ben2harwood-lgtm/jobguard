import { Body, Controller, Get, Header, HttpException, Inject, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { cookieToken, IDENTITY_APPLICATION, type IdentityHttpRequest } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";
import { SubscriptionPersistenceError } from "@jobguard/db";
import { subscriptionFailure, type SubscriptionApplication } from "./subscription.application.js";
import { subscriptionHttpCommandV1, subscriptionHttpStatus } from "./subscription.authority.js";
export const SUBSCRIPTION_APPLICATION = "SUBSCRIPTION_APPLICATION";
/** Exact paths only; the guard admits them for a real signed-in company session and never for a practice session. */
@ApiTags("subscriptions") @Controller("subscriptions")
export class SubscriptionController {
  constructor(@Inject(SUBSCRIPTION_APPLICATION) private readonly application: () => SubscriptionApplication, @Inject(IDENTITY_APPLICATION) private readonly identity: () => IdentityApplication) {}
  private credentials(request: IdentityHttpRequest, read = false) {
    return { sessionToken: cookieToken(request), tenantHeader: request.headers["x-tenant-id"], csrfToken: request.headers["x-csrf-token"], origin: request.headers.origin ?? (read ? this.identity().allowedOrigin : undefined) };
  }
  private async run<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) { const body = subscriptionFailure(error); throw new HttpException(body, subscriptionHttpStatus(body.code)); }
  }
  @Get("current") @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Read the signed-in made-up company's saved subscription facts (synthetic only)" })
  @ApiResponse({ status: 200, description: "subscription-persisted-read.v1" })
  read(@Req() request: IdentityHttpRequest) { return this.run(() => this.application().read(this.credentials(request, true))); }
  @Post("commands") @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Accept terms, change plan or approve a simulated payment for the signed-in made-up company (synthetic only)" })
  @ApiResponse({ status: 201, description: "Stored command result; replays return the first result" })
  command(@Body() body: unknown, @Req() request: IdentityHttpRequest) {
    return this.run(async () => {
      const parsed = subscriptionHttpCommandV1.safeParse(body);
      if (!parsed.success) throw new SubscriptionPersistenceError("INVALID_SUBSCRIPTION_INPUT");
      return this.application().command(this.credentials(request), parsed.data.commandId, parsed.data.command);
    });
  }
}
