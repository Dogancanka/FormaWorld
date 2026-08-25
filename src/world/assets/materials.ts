export interface AssetCategoryOption {
  id: string;
  label: string;
}

/**
 * The physical form a stack of material takes in the yard.
 */
export type AssetForm = "lumber" | "pipes" | "pallet" | "drums" | "panels" | "fittings";

export interface AssetAppearance {
  form: AssetForm;
  /** Main material colour. */
  color: string;
  /** Banding, straps and tags. */
  accent: string;
  /** The value the appearance was derived from, for grouping and traceability. */
  key: string;
  categoryLabel: string;
  /** True when the look came from a category APS actually returned. */
  categorised: boolean;
}

const FORMS: AssetForm[] = ["lumber", "pipes", "pallet", "drums", "panels", "fittings"];

const COLORS: [string, string][] = [
  ["#e6c07a", "#a97b3c"],
  ["#cfdae1", "#5f7d90"],
  ["#e3ddcd", "#8d8470"],
  ["#8fbcd4", "#3c6e8f"],
  ["#d6a48f", "#93513c"],
  ["#b8d1a6", "#527a45"],
  ["#d9c7e2", "#7a5f8e"],
  ["#e8d59a", "#a08333"],
];

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function look(formIndex: number, colorIndex: number, key: string, categoryLabel: string, categorised: boolean): AssetAppearance {
  const [color, accent] = COLORS[colorIndex % COLORS.length];
  return { form: FORMS[formIndex % FORMS.length], color, accent, key, categoryLabel, categorised };
}

/** What an asset record offers for deciding how its material looks. */
export interface AssetLookInput {
  categoryId?: string;
  /** Category text APS returned on the record itself, if any. */
  categoryText?: string;
  title?: string;
  externalId?: string;
}

/**
 * Appearance for one asset.
 *
 * When the project's category list resolves the asset's category, the form and
 * colour come from that category's position in the list — so every asset in a
 * category looks the same and two categories never look alike.
 *
 * Many projects do not populate the categories API at all. Falling back to a
 * single grey look there made every yard identical, so the fallback instead
 * hashes whatever the record does carry — its own category text, else its title
 * — into the same palette. The result is still deterministic and still stable
 * per record; it just no longer depends on an endpoint the project may not use.
 */
export function assetAppearance(
  input: AssetLookInput,
  categories: AssetCategoryOption[],
): AssetAppearance {
  const index = input.categoryId
    ? categories.findIndex((category) => category.id === input.categoryId)
    : -1;
  if (index >= 0) {
    return look(index, index, `category:${input.categoryId}`, categories[index].label, true);
  }

  const fallback = [input.categoryText, input.title, input.externalId]
    .find((candidate) => typeof candidate === "string" && candidate.trim());
  if (!fallback) return look(2, 2, "unknown", "No category", false);

  const seed = hash(fallback.trim().toLowerCase());
  return look(
    seed % FORMS.length,
    (seed >>> 5) % COLORS.length,
    input.categoryText ? `text:${input.categoryText.trim().toLowerCase()}` : `record:${fallback.trim().toLowerCase()}`,
    input.categoryText?.trim() ?? "No category",
    false,
  );
}

/**
 * The material groups present in one lane, ordered by the project's own category
 * order where it exists, so like material stands together.
 */
export function assetMaterialGroups<T>(
  assets: T[],
  lookOf: (asset: T) => AssetAppearance,
  categories: AssetCategoryOption[],
): Array<{ key: string; assets: T[] }> {
  const order = new Map(categories.map((category, index) => [`category:${category.id}`, index]));
  const groups = new Map<string, T[]>();
  for (const asset of assets) {
    const key = lookOf(asset).key;
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder === rightOrder ? left.localeCompare(right) : leftOrder - rightOrder;
    })
    .map(([key, grouped]) => ({ key, assets: grouped }));
}
