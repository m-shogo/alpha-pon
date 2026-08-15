import { existsSync, readFileSync } from "fs";
import { normalizeReadOnlyJsonObjectArrayField } from "./read-only-json.js";

export type ReadOnlyJsonObjectArrayFileLoad<T> = {
  object: Record<string, unknown> | null;
  rows: T[];
  missing: boolean;
  parseError: boolean;
  invalidRoot: boolean;
  invalidField: boolean;
};

export function readReadOnlyJsonObjectArrayFile<T>(
  path: string,
  field: string,
): ReadOnlyJsonObjectArrayFileLoad<T> {
  if (!existsSync(path)) {
    return {
      object: null,
      rows: [],
      missing: true,
      parseError: false,
      invalidRoot: false,
      invalidField: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return {
      object: null,
      rows: [],
      missing: false,
      parseError: true,
      invalidRoot: false,
      invalidField: false,
    };
  }

  const normalized = normalizeReadOnlyJsonObjectArrayField<T>(parsed, field);
  return {
    ...normalized,
    missing: false,
    parseError: false,
  };
}
