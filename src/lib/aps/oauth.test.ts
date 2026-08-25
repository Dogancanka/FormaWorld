import { describe, expect, it } from "vitest";
import { APS_AUTHORIZE_URL } from "./config";
import { buildAuthorizationUrl } from "./oauth";

describe("buildAuthorizationUrl", () => {
  it("builds an APS v2 authorization-code URL with the required scopes and state", () => {
    const result = new URL(
      buildAuthorizationUrl(
        {
          clientId: "client-id",
          clientSecret: "server-only-secret",
          callbackUrl: "http://localhost:3000/api/auth/callback",
        },
        "csrf-state",
      ),
    );

    expect(result.origin + result.pathname).toBe(APS_AUTHORIZE_URL);
    expect(result.searchParams.get("response_type")).toBe("code");
    expect(result.searchParams.get("client_id")).toBe("client-id");
    expect(result.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback",
    );
    expect(result.searchParams.get("scope")?.split(" ")).toEqual([
      "data:read",
      "data:write",
      "account:read",
    ]);
    expect(result.searchParams.get("state")).toBe("csrf-state");
    expect(result.toString()).not.toContain("server-only-secret");
  });
});
