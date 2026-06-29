// worldThemeCandidateHypotheses を保存する実行スクリプト。
// UI表示だけでなく、30/90/180日後に答え合わせするためのworld専用仮説DBとして残す。

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { addDaysJst, todayJst } from "./date.js";
import {
  buildWorldThemeCandidateHypotheses,
  type PersonalWatchlistForHypothesis,
  type WorldEventForHypothesis,
  type WorldThemeCandidateHypothesis,
} from "./world-theme-candidate-hypotheses.js";

const LATEST_PATH = "data/world_theme_candidate_hypotheses_latest.json";
const JSONL_PATH = "data/world_theme_candidate_hypotheses.jsonl";

type PersistedWorldThemeCandidateHypothesis = WorldThemeCandidateHypothesis & {
  schemaVersion: 1;
  hypothesisId: string;
  detectedAt: string;
  reviewDueDates: Array<{ afterDays: 30 | 90 | 180; dueAt: string; status: "open" }>;
  status: "open";
};

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

function hypothesisId(item: WorldThemeCandidateHypothesis, detectedAt: string): string {
  return [detectedAt, normalize(item.theme), normalize(item.candidateCode), normalize(item.sourceEventTitle)].join("__");
}

function readExistingIds(): Set<string> {
  if (!existsSync(JSONL_PATH)) return new Set();
  return new Set(readFileSync(JSONL_PATH, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as { hypothesisId?: string })
    .map(row => row.hypothesisId)
    .filter((id): id is string => Boolean(id)));
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
  const events = readJson<WorldEventForHypothesis[]>("reports/world_events_latest.json", []);
  const personalWatchlist = readYaml<PersonalWatchlistForHypothesis>("config/personal-watchlist.yml", { priorityWatches: [] });
  const built = buildWorldThemeCandidateHypotheses(events, personalWatchlist).map(item => persist(item, detectedAt));
  const existingIds = readExistingIds();
  const newItems = built.filter(item => !existingIds.has(item.hypothesisId));

  mkdirSync("data", { recursive: true });
  writeFileSync(LATEST_PATH, JSON.stringify({ generatedAt: detectedAt, count: built.length, hypotheses: built }, null, 2), "utf-8");
  for (const item of newItems) appendFileSync(JSONL_PATH, `${JSON.stringify(item)}\n`, "utf-8");

  console.log(`world theme candidate hypotheses: latest=${built.length}, appended=${newItems.length}`);
  console.log(`保存先: ${LATEST_PATH} / ${JSONL_PATH}`);
  console.log("※買い推奨ではなく、世界情勢からの調査仮説を後で答え合わせするためのDBです。");
}

main();
