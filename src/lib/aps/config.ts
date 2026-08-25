import "server-only";

export const APS_AUTHORIZE_URL =
  "https://developer.api.autodesk.com/authentication/v2/authorize";
export const APS_TOKEN_URL =
  "https://developer.api.autodesk.com/authentication/v2/token";
export const APS_API_BASE_URL = "https://developer.api.autodesk.com";
export const APS_SCOPES = ["data:read", "data:write", "account:read"] as const;

/**
 * Extra scopes to request beyond the three the world needs.
 *
 * Kept out of the required list on purpose: an unknown scope makes the whole
 * authorize call fail, so a scope this deployment's APS application is not
 * registered for would break sign-in for everyone. `user-profile:read` is the
 * useful one — it lets saved progress key to the Autodesk account instead of a
 * browser cookie — and is opt-in for exactly that reason.
 */
export function getApsScopes(): string[] {
  const extra = (process.env.APS_EXTRA_SCOPES ?? "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => /^[a-z][a-z0-9:_-]*$/.test(scope));
  return [...new Set([...APS_SCOPES, ...extra])];
}

export interface ApsConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export function getApsConfig(): ApsConfig {
  const clientId = process.env.APS_CLIENT_ID;
  const clientSecret = process.env.APS_CLIENT_SECRET;
  const callbackUrl = process.env.APS_CALLBACK_URL;

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error(
      "APS is not configured. Set APS_CLIENT_ID, APS_CLIENT_SECRET, and APS_CALLBACK_URL.",
    );
  }

  return { clientId, clientSecret, callbackUrl };
}
