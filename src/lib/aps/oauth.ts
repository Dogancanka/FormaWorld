import "server-only";

import {
  APS_AUTHORIZE_URL,
  APS_TOKEN_URL,
  getApsScopes,
  type ApsConfig,
} from "./config";

export interface ApsTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface TokenErrorPayload {
  error?: string;
  error_description?: string;
}

export function buildAuthorizationUrl(config: ApsConfig, state: string): string {
  const url = new URL(APS_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: getApsScopes().join(" "),
    state,
  }).toString();
  return url.toString();
}

async function requestToken(
  config: ApsConfig,
  body: URLSearchParams,
): Promise<ApsTokenResponse> {
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");
  const response = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as TokenErrorPayload;
    throw new Error(
      `APS authentication failed (${response.status}): ${payload.error_description ?? payload.error ?? response.statusText}`,
    );
  }

  return response.json() as Promise<ApsTokenResponse>;
}

export function exchangeAuthorizationCode(
  config: ApsConfig,
  code: string,
): Promise<ApsTokenResponse> {
  return requestToken(
    config,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.callbackUrl,
    }),
  );
}

export function refreshAccessToken(
  config: ApsConfig,
  refreshToken: string,
): Promise<ApsTokenResponse> {
  return requestToken(
    config,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}
