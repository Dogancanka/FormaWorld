import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The session is a Next cookie store in production. Here it is a plain object
// with the same surface, so the refresh path can be exercised directly.
interface FakeSession {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  grantedScopes?: string[];
  save: () => Promise<void>;
  destroy: () => void;
}

let session: FakeSession;
let destroyed: boolean;

vi.mock("../session", () => ({
  getSession: async () => session,
}));

vi.mock("./config", async () => {
  const actual = await vi.importActual<typeof import("./config")>("./config");
  return {
    ...actual,
    getApsConfig: () => ({ clientId: "id", clientSecret: "secret", callbackUrl: "http://localhost/cb" }),
  };
});

const refreshAccessToken = vi.fn();
vi.mock("./oauth", async () => {
  const actual = await vi.importActual<typeof import("./oauth")>("./oauth");
  return { ...actual, refreshAccessToken: (...args: unknown[]) => refreshAccessToken(...args) };
});

function freshSession(refreshToken = "refresh-1"): FakeSession {
  destroyed = false;
  return {
    accessToken: "access-1",
    // Already inside the 60s renewal window, so every call wants a refresh.
    expiresAt: Date.now() + 10_000,
    refreshToken,
    grantedScopes: ["data:read"],
    save: async () => {},
    destroy: () => { destroyed = true; },
  };
}

beforeEach(() => {
  vi.resetModules();
  refreshAccessToken.mockReset();
  session = freshSession();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getValidAccessToken", () => {
  it("refreshes once for concurrent callers sharing a refresh token", async () => {
    // The reconciliation fires seven feeds at once. Autodesk rotates refresh
    // tokens, so seven parallel refreshes meant six `invalid_grant` failures
    // and a destroyed session halfway through a visit.
    refreshAccessToken.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600, token_type: "Bearer" };
    });
    const { getValidAccessToken } = await import("./client");

    const tokens = await Promise.all(Array.from({ length: 7 }, () => getValidAccessToken()));

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(new Set(tokens)).toEqual(new Set(["access-2"]));
    expect(session.refreshToken).toBe("refresh-2");
    expect(destroyed).toBe(false);
  });

  it("keeps the session when the token endpoint is merely unwell", async () => {
    const { ApsAuthError } = await import("./oauth");
    refreshAccessToken.mockRejectedValue(new ApsAuthError("APS authentication failed (503)", 503));
    const { getValidAccessToken } = await import("./client");

    await expect(getValidAccessToken()).rejects.toThrow(/token refresh is failing/);
    expect(destroyed).toBe(false);
    expect(session.refreshToken).toBe("refresh-1");
  });

  it("ends the session when Autodesk rejects the grant outright", async () => {
    const { ApsAuthError } = await import("./oauth");
    refreshAccessToken.mockRejectedValue(
      new ApsAuthError("APS authentication failed (400)", 400, "invalid_grant"),
    );
    const { getValidAccessToken } = await import("./client");

    await expect(getValidAccessToken()).rejects.toThrow(/APS authentication failed/);
    expect(destroyed).toBe(true);
  });

  it("keeps the requested scopes when APS does not echo them back", async () => {
    // An empty scope echo used to be recorded as "no scopes granted", which
    // blocked every write action behind a sign-in that could not fix it.
    refreshAccessToken.mockResolvedValue({
      access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600, token_type: "Bearer",
    });
    const { getValidAccessToken } = await import("./client");

    await getValidAccessToken();

    expect(session.grantedScopes).toContain("data:write");
  });

  it("records exactly what APS says when it does echo scopes", async () => {
    refreshAccessToken.mockResolvedValue({
      access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600,
      token_type: "Bearer", scope: "data:read account:read",
    });
    const { getValidAccessToken } = await import("./client");

    await getValidAccessToken();

    expect(session.grantedScopes).toEqual(["data:read", "account:read"]);
  });

  it("does not call the token endpoint while the access token is still good", async () => {
    session.expiresAt = Date.now() + 600_000;
    const { getValidAccessToken } = await import("./client");

    expect(await getValidAccessToken()).toBe("access-1");
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});
