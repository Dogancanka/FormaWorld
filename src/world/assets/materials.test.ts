import { describe, expect, it } from "vitest";
import { assetAppearance, assetMaterialGroups, type AssetCategoryOption } from "./materials";

const categories: AssetCategoryOption[] = [
  { id: "c1", label: "Pipework" },
  { id: "c2", label: "Timber" },
  { id: "c3", label: "Ductwork" },
];

describe("asset appearance from a populated category list", () => {
  it("gives two assets in the same category the same form and colour", () => {
    expect(assetAppearance({ categoryId: "c2", title: "A" }, categories))
      .toEqual(assetAppearance({ categoryId: "c2", title: "B" }, categories));
  });

  it("gives different categories different forms and colours", () => {
    const looks = categories.map((category) => assetAppearance({ categoryId: category.id }, categories));
    expect(new Set(looks.map((item) => item.form)).size).toBe(categories.length);
    expect(new Set(looks.map((item) => item.color)).size).toBe(categories.length);
  });

  it("keeps its palette stable as more categories are added", () => {
    const before = assetAppearance({ categoryId: "c1" }, categories);
    const after = assetAppearance({ categoryId: "c1" }, [...categories, { id: "c4", label: "Cable" }]);
    expect(after).toEqual(before);
  });
});

describe("asset appearance when the project exposes no categories", () => {
  // Many projects never populate the categories API. A single grey fallback made
  // every yard identical, so the look is hashed from what the record does carry.
  it("still produces a varied yard", () => {
    const assets = Array.from({ length: 30 }, (_, index) => ({ title: `Asset ${index}` }));
    const looks = assets.map((asset) => assetAppearance(asset, []));
    expect(new Set(looks.map((item) => item.form)).size).toBeGreaterThan(3);
    expect(new Set(looks.map((item) => item.color)).size).toBeGreaterThan(3);
  });

  it("never falls back to one shared neutral look", () => {
    const first = assetAppearance({ title: "Pump 12" }, []);
    const second = assetAppearance({ title: "Duct run 4" }, []);
    expect(first.form === second.form && first.color === second.color).toBe(false);
  });

  it("stays stable for the same record", () => {
    expect(assetAppearance({ title: "Pump 12" }, [])).toEqual(assetAppearance({ title: "Pump 12" }, []));
  });

  it("groups by the record's own category text when APS returns one", () => {
    const left = assetAppearance({ categoryText: "Valves", title: "V1" }, []);
    const right = assetAppearance({ categoryText: "valves ", title: "V2" }, []);
    expect(left.form).toBe(right.form);
    expect(left.key).toBe(right.key);
    expect(left.categoryLabel).toBe("Valves");
  });

  it("reports that the look did not come from a resolved category", () => {
    expect(assetAppearance({ title: "Pump 12" }, []).categorised).toBe(false);
    expect(assetAppearance({ categoryId: "c1" }, categories).categorised).toBe(true);
  });

  it("still returns a usable look for a record with nothing on it", () => {
    const look = assetAppearance({}, []);
    expect(look.form).toBeDefined();
    expect(look.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("assetMaterialGroups", () => {
  const assets = [
    { id: "a", categoryId: "c2" }, { id: "b", title: "loose" }, { id: "c", categoryId: "c1" },
    { id: "d", categoryId: "c2" }, { id: "e", categoryId: "c1" },
  ];
  const lookOf = (asset: typeof assets[number]) => assetAppearance(asset, categories);

  it("stands like material together, in the project's own category order", () => {
    const groups = assetMaterialGroups(assets, lookOf, categories);
    expect(groups[0].assets.map((asset) => asset.id)).toEqual(["c", "e"]);
    expect(groups[1].assets.map((asset) => asset.id)).toEqual(["a", "d"]);
  });

  it("keeps every asset", () => {
    expect(assetMaterialGroups(assets, lookOf, categories).flatMap((group) => group.assets)).toHaveLength(assets.length);
  });
});
