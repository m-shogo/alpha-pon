// watchlist.yml への書き込みヘルパー

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load, dump } from "js-yaml";
import type { WatchlistConfig, Candidate } from "./types.js";

const WATCHLIST_PATH = join(process.cwd(), "config", "watchlist.yml");

export function loadWatchlistRaw(): WatchlistConfig {
  const raw = readFileSync(WATCHLIST_PATH, "utf-8");
  return load(raw) as WatchlistConfig;
}

export function saveWatchlist(config: WatchlistConfig): void {
  const yaml = dump(config, {
    indent: 2,
    lineWidth: -1,
    quotingType: '"',
  });
  writeFileSync(WATCHLIST_PATH, yaml, "utf-8");
}

export function addCandidates(
  newEntries: Candidate[],
  dryRun = false
): { added: Candidate[]; skipped: Candidate[] } {
  const config = loadWatchlistRaw();
  const existingCodes = new Set(config.symbols.map(s => s.code));

  const added: Candidate[] = [];
  const skipped: Candidate[] = [];

  for (const entry of newEntries) {
    if (existingCodes.has(entry.code)) {
      skipped.push(entry);
    } else {
      added.push(entry);
    }
  }

  if (!dryRun && added.length > 0) {
    config.symbols.push(...added);
    saveWatchlist(config);
  }

  return { added, skipped };
}
