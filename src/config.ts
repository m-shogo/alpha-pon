import { readFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import type { WatchlistConfig, RulesConfig, ThemesConfig } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readYaml<T>(filename: string): T {
  const path = join(process.cwd(), "config", filename);
  const raw = readFileSync(path, "utf-8");
  return load(raw) as T;
}

export function validateThemesConfig(value: unknown): ThemesConfig {
  if (!isRecord(value) || !isRecord(value.themes)) {
    throw new Error("themes.yml: themes object is required");
  }

  for (const [key, entry] of Object.entries(value.themes)) {
    if (!isRecord(entry)) {
      throw new Error(`themes.yml: ${key} must be an object`);
    }
    if (!isNonEmptyString(entry.label)) {
      throw new Error(`themes.yml: ${key}.label must be a non-empty string`);
    }
    if (typeof entry.score !== "number" || !Number.isFinite(entry.score)) {
      throw new Error(`themes.yml: ${key}.score must be a finite number`);
    }
  }

  return value as ThemesConfig;
}

export function loadWatchlist(): WatchlistConfig {
  return readYaml<WatchlistConfig>("watchlist.yml");
}

export function loadRules(): RulesConfig {
  return readYaml<RulesConfig>("rules.yml");
}

export function loadThemes(): ThemesConfig {
  return validateThemesConfig(readYaml<unknown>("themes.yml"));
}
