/** True when the catalog/asset name is a laptop (triggers laptop detail fields). */
export function isLaptopAssetName(name?: string | null) {
  return /\blaptops?\b/i.test((name ?? "").trim());
}
