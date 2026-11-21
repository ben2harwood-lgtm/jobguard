import { pilotCustomerCookie } from "@jobguard/config";

const pilotRoutes = new Set([
  "GET /healthz",
  "POST /auth/request",
  "POST /auth/verify",
  "GET /auth/session",
  "POST /auth/signout",
  "POST /auth/invitations",
  "POST /auth/members/commands",
]);

export function hasNonPilotCookie(cookie: string | undefined): boolean {
  const reserved = /^(?:jg_(?:session|practice_pair)|jobguard_(?:session|customer|sso_state|oidc_state))=/u;
  return cookie?.split(";").some(part => reserved.test(part.trim())) ?? false;
}

type Request = { method: string; path: string; headers: Record<string, string | undefined> };
interface Response {
  status(code: number): Response;
  set(name: string, value: string): Response;
  json(body: { code: string }): void;
}

export function pilotApiIngress(origin: string) {
  const host = new URL(origin).host;
  return (request: Request, response: Response, next: () => void) => {
    const cookie = request.headers.cookie;
    if (request.headers.host !== host ||
        !pilotRoutes.has(`${request.method} ${request.path}`) ||
        hasNonPilotCookie(cookie) ||
        cookie?.split(";").some(part => part.trim().startsWith(`${pilotCustomerCookie}=`)) ||
        request.headers["stripe-signature"] !== undefined || request.headers["webhook-signature"] !== undefined) {
      response.status(403).set("Cache-Control", "no-store").json({ code: "PILOT_INGRESS_REFUSED" });
      return;
    }
    next();
  };
}
