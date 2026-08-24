export function hasCanonicalStringItems(value: unknown, minItems: number): boolean {
  return Array.isArray(value)
    && value.length >= minItems
    && value.every(item => typeof item === "string" && item.length > 0 && item.trim() === item);
}
