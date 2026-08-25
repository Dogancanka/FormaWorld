import { describe, expect, it } from "vitest";
import { sessionMayWrite } from "./session";

describe("sessionMayWrite", () => {
  it("allows a session that was told it has write access", () => {
    expect(sessionMayWrite({ grantedScopes: ["data:read", "data:write"] })).toBe(true);
  });

  it("refuses a session APS answered with read-only scopes", () => {
    expect(sessionMayWrite({ grantedScopes: ["data:read", "account:read"] })).toBe(false);
  });

  it("lets an unknown scope set through to APS rather than guessing", () => {
    // APS does not always echo `scope`. Recording that silence as "no scopes"
    // is what left write actions blocked behind a sign-in that changed nothing;
    // Autodesk is the authority and answers with a real 403 if it must.
    expect(sessionMayWrite({ grantedScopes: [] })).toBe(true);
    expect(sessionMayWrite({})).toBe(true);
  });
});
