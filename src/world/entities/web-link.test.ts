import { describe, expect, it } from "vitest";
import type { WorldEntity } from "./world-entity";
import { isAutodeskUrl, recordWebLink } from "./web-link";

function entity(raw: unknown): WorldEntity {
  return {
    id: "issue:i1",
    externalId: "i1",
    type: "issue",
    title: "A record",
    source: "aps",
    projectId: "b.p",
    metadata: { raw },
  };
}

describe("recordWebLink", () => {
  it("reads the JSON:API webView link Data Management answers with", () => {
    expect(recordWebLink(entity({
      links: { self: { href: "https://developer.api.autodesk.com/data/v1/x" }, webView: { href: "https://acc.autodesk.com/docs/files/projects/p/x" } },
    }))).toBe("https://acc.autodesk.com/docs/files/projects/p/x");
  });

  it("prefers the web view over anything else on the record", () => {
    expect(recordWebLink(entity({
      webUrl: "https://acc.autodesk.com/second",
      links: { webView: { href: "https://acc.autodesk.com/first" } },
    }))).toBe("https://acc.autodesk.com/first");
  });

  it("never offers the API's own self link as somewhere to click", () => {
    // `self` is a REST endpoint. Sending a reader there shows them JSON, or an
    // authentication error, not their record.
    expect(recordWebLink(entity({
      links: { self: { href: "https://developer.api.autodesk.com/data/v1/x" } },
    }))).toBeUndefined();
  });

  it("refuses a link that is not Autodesk's", () => {
    // These values come out of project data. A record whose custom field holds
    // a URL must never become a link this application invites anyone to click.
    expect(recordWebLink(entity({ webUrl: "https://example.com/phish" }))).toBeUndefined();
    expect(recordWebLink(entity({ webUrl: "https://acc.autodesk.com.evil.test/x" }))).toBeUndefined();
  });

  it("refuses anything that is not https", () => {
    expect(recordWebLink(entity({ webUrl: "http://acc.autodesk.com/x" }))).toBeUndefined();
    expect(recordWebLink(entity({ webUrl: "javascript:alert(1)" }))).toBeUndefined();
  });

  it("says nothing when APS gave no link at all", () => {
    expect(recordWebLink(entity({ title: "no link here" }))).toBeUndefined();
    expect(recordWebLink(entity(undefined))).toBeUndefined();
  });

  it("ignores a link field that is empty or malformed", () => {
    expect(recordWebLink(entity({ webUrl: "   " }))).toBeUndefined();
    expect(recordWebLink(entity({ webUrl: "not a url" }))).toBeUndefined();
  });
});

describe("isAutodeskUrl", () => {
  it("accepts Autodesk hosts and their subdomains", () => {
    expect(isAutodeskUrl("https://acc.autodesk.com/build/issues")).toBe(true);
    expect(isAutodeskUrl("https://emea.acc.autodesk.com/build/issues")).toBe(true);
    expect(isAutodeskUrl("https://autodesk.com")).toBe(true);
  });

  it("rejects a host that merely ends in something similar", () => {
    expect(isAutodeskUrl("https://notautodesk.com/x")).toBe(false);
    expect(isAutodeskUrl("https://autodesk.com.attacker.test/x")).toBe(false);
  });
});
