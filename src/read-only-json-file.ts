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

export type ReadOnlyJsonObjectFileLoad<T extends Record<string, unknown>> = {
  object: T | null;
  missing: boolean;
  parseError: boolean;
  invalidRoot: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readReadOnlyJsonObjectFile<T extends Record<string, unknown>>(
  path: string,
): ReadOnlyJsonObjectFileLoad<T> {
  if (!existsSync(path)) {
    return {
      object: null,
      missing: true,
      parseError: false,
      invalidRoot: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return {
      object: null,
      missing: false,
      parseError: true,
      invalidRoot: false,
    };
  }

  if (!isRecord(parsed)) {
    return {
      object: null,
      missing: false,
      parseError: false,
      invalidRoot: true,
    };
  }

  return {
    object: parsed as T,
    missing: false,
    parseError: false,
    invalidRoot: false,
  };
}

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
