import { existsSync, lstatSync, readFileSync } from "fs";
import { dirname, resolve, sep } from "path";
import { normalizeReadOnlyJsonObjectArrayField } from "./read-only-json.js";

export type ReadOnlyJsonArrayFileLoad<T> = {
  rows: T[];
  missing: boolean;
  parseError: boolean;
  invalidRoot: boolean;
};

export type ReadOnlyJsonObjectArrayFileLoad<T> = {
  object: Record<string, unknown> | null;
  rows: T[];
  missing: boolean;
  parseError: boolean;
  invalidRoot: boolean;
  invalidField: boolean;
  invalidRows: number;
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

function hasSymlinkedAncestorWithinCwd(path: string): boolean {
  const root = resolve(process.cwd());
  let current = dirname(resolve(path));
  if (current !== root && !current.startsWith(`${root}${sep}`)) return false;

  while (current !== root) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
  return false;
}

export function isCanonicalReadOnlyJsonFile(path: string): boolean {
  try {
    if (hasSymlinkedAncestorWithinCwd(path)) return false;
    const stat = lstatSync(path);
    return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1;
  } catch {
    return false;
  }
}

export function readReadOnlyJsonArrayFile<T>(path: string): ReadOnlyJsonArrayFileLoad<T> {
  if (!existsSync(path)) {
    return {
      rows: [],
      missing: true,
      parseError: false,
      invalidRoot: false,
    };
  }
  if (!isCanonicalReadOnlyJsonFile(path)) {
    return {
      rows: [],
      missing: false,
      parseError: true,
      invalidRoot: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return {
      rows: [],
      missing: false,
      parseError: true,
      invalidRoot: false,
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      rows: [],
      missing: false,
      parseError: false,
      invalidRoot: true,
    };
  }

  return {
    rows: parsed as T[],
    missing: false,
    parseError: false,
    invalidRoot: false,
  };
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
  if (!isCanonicalReadOnlyJsonFile(path)) {
    return {
      object: null,
      missing: false,
      parseError: true,
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
  isRow?: (value: unknown) => value is T,
): ReadOnlyJsonObjectArrayFileLoad<T> {
  if (!existsSync(path)) {
    return {
      object: null,
      rows: [],
      missing: true,
      parseError: false,
      invalidRoot: false,
      invalidField: false,
      invalidRows: 0,
    };
  }
  if (!isCanonicalReadOnlyJsonFile(path)) {
    return {
      object: null,
      rows: [],
      missing: false,
      parseError: true,
      invalidRoot: false,
      invalidField: false,
      invalidRows: 0,
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
      invalidRows: 0,
    };
  }

  const normalized = normalizeReadOnlyJsonObjectArrayField<unknown>(parsed, field);
  if (normalized.invalidRoot || normalized.invalidField || !isRow) {
    return {
      object: normalized.object,
      rows: normalized.rows as T[],
      missing: false,
      parseError: false,
      invalidRoot: normalized.invalidRoot,
      invalidField: normalized.invalidField,
      invalidRows: 0,
    };
  }

  const rows = normalized.rows.filter(isRow);
  return {
    object: normalized.object,
    rows,
    missing: false,
    parseError: false,
    invalidRoot: false,
    invalidField: false,
    invalidRows: normalized.rows.length - rows.length,
  };
}
