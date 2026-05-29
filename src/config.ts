import { readFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import type { WatchlistConfig, RulesConfig, ThemesConfig } from "./types.js";

function readYaml<T>(filename: string): T {
  const path = join(process.cwd(), "config", filename);
  const raw = readFileSync(path, "utf-8");
  return load(raw) as T;
}

export function loadWatchlist(): WatchlistConfig {
  return readYaml<WatchlistConfig>("watchlist.yml");
}

export function loadRules(): RulesConfig {
  return readYaml<RulesConfig>("rules.yml");
}

export function loadThemes(): ThemesConfig {
  return readYaml<ThemesConfig>("themes.yml");
}
