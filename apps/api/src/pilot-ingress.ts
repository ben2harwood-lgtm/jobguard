import { pilotCustomerCookie, requirePilotG1 } from "@jobguard/config";

const pilotRoutes = new Set([
  "GET /healthz",
  "POST /auth/request",
  "POST /auth/verify",
  "GET /auth/session",
  "POST /auth/signout",
  "POST /auth/invitations",
  "POST /auth/members/commands",
]);
const pilotPortalRoutes = new Set([
  "POST /customer-portal/issue",
  "POST /customer-portal/revoke",
  "POST /customer-portal/signin",
  "POST /customer-portal/signout",
  "POST /customer-portal/read",
  "POST /customer-portal/quote",
  "POST /customer-portal/quote-accept",
  "POST /customer-portal/variations/read",
  "POST /customer-portal/variation-approvals",
  "POST /customer-portal/stages",
  "POST /customer-portal/stage-acknowledge",
  "POST /customer-portal/messages",
]);

export function hasPracticeCookie(cookie: string | undefined): boolean {
  const reserved = /^(?:jg_(?:session|practice_pair)|jobguard_(?:session|customer|sso_state|oidc_state))=/u;
  return cookie?.split(";").some(part => reserved.test(part.trim())) ?? false;
}

function hasPilotCustomerCookie(cookie: string | undefined): boolean {
  return cookie?.split(";").some(part => part.trim().startsWith(`${pilotCustomerCookie}=`)) ?? false;
}

export function hasNonPilotCookie(cookie: string | undefined): boolean {
  return hasPracticeCookie(cookie) || hasPilotCustomerCookie(cookie);
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
    const route = `${request.method} ${request.path}`;
    const portal = pilotPortalRoutes.has(route);
    if (request.headers.host !== host ||
        (!portal && !pilotRoutes.has(route)) ||
        hasPracticeCookie(cookie) ||
        (!portal && hasPilotCustomerCookie(cookie)) ||
        request.headers["stripe-signature"] !== undefined || request.headers["webhook-signature"] !== undefined) {
      response.status(403).set("Cache-Control", "no-store").json({ code: "PILOT_INGRESS_REFUSED" });
      return;
    }
    if (portal) {
      try { requirePilotG1(process.env); }
      catch {
        response.status(403).set("Cache-Control", "no-store").json({ code: "PILOT_INGRESS_REFUSED" });
        return;
      }
    }
    next();
  };
}
