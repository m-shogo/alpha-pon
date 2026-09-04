// worldThemeCandidateHypotheses を保存する実行スクリプト。
// UI表示だけでなく、30/90/180日後に答え合わせするためのworld専用仮説DBとして残す。

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { addDaysJst, todayJst } from "./date.js";
import {
  normalizeWorldThemeCandidateEventInput,
  normalizeWorldThemeCandidateWatchlistInput,
} from "./world-theme-candidate-hypothesis-input.js";
import { normalizeWorldThemeCandidateHypothesisHistory } from "./world-theme-candidate-hypothesis-history-input.js";
import {
  buildWorldThemeCandidateHypotheses,
  type WorldThemeCandidateHypothesis,
} from "./world-theme-candidate-hypotheses.js";
import { readReadOnlyTextFile } from "./read-only-text-file.js";

const LATEST_PATH = "data/world_theme_candidate_hypotheses_latest.json";
const JSONL_PATH = "data/world_theme_candidate_hypotheses.jsonl";

type PersistedWorldThemeCandidateHypothesis = WorldThemeCandidateHypothesis & {
  schemaVersion: 1;
  hypothesisId: string;
  detectedAt: string;
  reviewDueDates: Array<{ afterDays: 30 | 90 | 180; dueAt: string; status: "open" }>;
  status: "open";
};

function readCanonicalText(path: string): string | null {
  if (!existsSync(path)) return null;
  const text = readReadOnlyTextFile(path);
  if (!text) throw new Error(`${path} must be a non-empty standalone regular file`);
  return text;
}

function readJson<T>(path: string, fallback: T): T {
  const text = readCanonicalText(path);
  if (text === null) return fallback;
  return JSON.parse(text) as T;
}

function readYaml<T>(path: string, fallback: T): T {
  const text = readCanonicalText(path);
  if (text === null) return fallback;
  return load(text) as T;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

function hypothesisId(item: WorldThemeCandidateHypothesis, detectedAt: string): string {
  return [detectedAt, normalize(item.theme), normalize(item.candidateCode), normalize(item.sourceEventTitle)].join("__");
}

function readExistingIds(): Set<string> {
  const text = readCanonicalText(JSONL_PATH);
  if (text === null) return new Set();
  const history = normalizeWorldThemeCandidateHypothesisHistory(text);
  if (history.status !== "ok") {
    throw new Error("world_theme_candidate_hypotheses.jsonl is malformed; existing hypothesis outputs were not modified");
  }
  return history.ids;
}

function assertCanonicalExistingOutput(path: string): void {
  if (!existsSync(path)) return;
  if (!readReadOnlyTextFile(path)) {
    throw new Error(`${path} must be a non-empty standalone regular file before it can be updated`);
  }
}

function persist(item: WorldThemeCandidateHypothesis, detectedAt: string): PersistedWorldThemeCandidateHypothesis {
  return {
    schemaVersion: 1,
    hypothesisId: hypothesisId(item, detectedAt),
    detectedAt,
    ...item,
    reviewDueDates: item.reviewAfterDays.map(afterDays => ({ afterDays, dueAt: addDaysJst(detectedAt, afterDays), status: "open" })),
    status: "open",
  };
}

function main(): void {
  const detectedAt = todayJst();
  const eventInput = normalizeWorldThemeCandidateEventInput(readJson<unknown>("reports/world_events_latest.json", []));
  if (eventInput.status !== "ok") {
    throw new Error("world_events_latest.json must have a valid array snapshot; existing hypothesis outputs were not modified");
  }

  const watchlistInput = normalizeWorldThemeCandidateWatchlistInput(
    readYaml<unknown>("config/personal-watchlist.yml", { priorityWatches: [] }),
  );
  if (watchlistInput.status !== "ok") {
    throw new Error("personal-watchlist.yml is malformed; existing hypothesis outputs were not modified");
  }

  const built = buildWorldThemeCandidateHypotheses(eventInput.events, watchlistInput.watchlist).map(item => persist(item, detectedAt));
  const existingIds = readExistingIds();
  const newItems = built.filter(item => !existingIds.has(item.hypothesisId));

  assertCanonicalExistingOutput(LATEST_PATH);
  assertCanonicalExistingOutput(JSONL_PATH);
  mkdirSync("data", { recursive: true });
  writeFileSync(LATEST_PATH, JSON.stringify({ generatedAt: detectedAt, count: built.length, hypotheses: built }, null, 2), "utf-8");
  for (const item of newItems) appendFileSync(JSONL_PATH, `${JSON.stringify(item)}\n`, "utf-8");

  console.log(`world theme candidate hypotheses: latest=${built.length}, appended=${newItems.length}`);
  console.log(`保存先: ${LATEST_PATH} / ${JSONL_PATH}`);
  console.log("※買い推奨ではなく、世界情勢から作った調査仮説を後で答え合わせするためのDBです。");
}

main();
