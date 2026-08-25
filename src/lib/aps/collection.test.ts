import { describe, expect, it } from "vitest";
import { apsCollection, apsTotal, describeCollection } from "./collection";

describe("apsCollection", () => {
  it("reads the documented key when the service uses it", () => {
    const collection = apsCollection({ results: [{ id: "a" }] }, "results", "data");
    expect(collection.key).toBe("results");
    expect(collection.records).toHaveLength(1);
  });

  it("finds the page when the service uses a different key than expected", () => {
    // The Forms district rendered nothing while pagination reported records,
    // because the page sits under `data` rather than `results`.
    const collection = apsCollection({ pagination: { totalResults: 1 }, data: [{ id: "form-1" }] }, "results");
    expect(collection.records).toHaveLength(1);
    expect(collection.key).toBe("data");
  });

  it("treats an empty documented array as a real empty page", () => {
    const collection = apsCollection({ results: [], pagination: { totalResults: 0 } }, "results", "data");
    expect(collection.key).toBe("results");
    expect(collection.records).toHaveLength(0);
  });

  it("reports the payload keys when nothing could be read", () => {
    const collection = apsCollection({ pagination: {}, message: "none" }, "results");
    expect(collection.records).toHaveLength(0);
    expect(collection.key).toBeUndefined();
    expect(collection.availableKeys).toEqual(["pagination", "message"]);
  });

  it("ignores arrays that are not records", () => {
    const collection = apsCollection({ ids: ["a", "b"] }, "results");
    expect(collection.records).toHaveLength(0);
  });

  it("survives a payload that is not an object", () => {
    expect(apsCollection(null, "results").records).toHaveLength(0);
    expect(apsCollection([{ id: "a" }], "results").records).toHaveLength(0);
  });
});

describe("apsTotal", () => {
  it("prefers the documented pagination total", () => {
    expect(apsTotal({ pagination: { totalResults: 42 } }, 3)).toBe(42);
  });

  it("accepts the alternative total shapes services use", () => {
    expect(apsTotal({ pagination: { total: 7 } }, 0)).toBe(7);
    expect(apsTotal({ totalResults: 9 }, 0)).toBe(9);
  });

  it("falls back to the loaded count when no total is reported", () => {
    expect(apsTotal({ results: [] }, 5)).toBe(5);
  });
});

describe("describeCollection", () => {
  it("names the key it read from", () => {
    expect(describeCollection("Forms", apsCollection({ data: [{ id: "a" }] }, "results"), 1))
      .toBe("Forms: key=data; records=1; total=1");
  });

  it("lists the payload keys when it read nothing, so a wrong guess is visible", () => {
    expect(describeCollection("Forms", apsCollection({ pagination: {} }, "results"), 0))
      .toBe("Forms: key=none keys=[pagination]; records=0; total=0");
  });
});
