// pnpm review:world-impact
// world event reflection を銘柄別の影響仮説レビューへ変換する。
// 既定は dry-run。--write の時だけ data/world_event_impacts.jsonl に追記する。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import {
  buildWorldImpactReviews,
  loadWorldImpactReviews,
  mergeExistingReviews,
  renderWorldImpactReviewMarkdown,
  saveWorldImpactReviews,
  writeWorldImpactLatest,
  type WorldEventImpactReview,
} from "./world-impact.js";
import type { WorldEventReflection } from "./analysis/world-event-reflection.js";

type AlphaDataLike = {
  candidates?: Array<{ code: string; name: string; tags?: string[]; reasons?: string[]; negativeReasons?: string[]; nextToSee?: string[] }>;
  universeCandidates?: Array<{ code: string; name: string; sector?: string | null; matchedWorldEventTags?: string[]; warnings?: string[] }>;
  generatedCompanyRules?: Array<{ code?: string; name?: string; thesis?: string[]; reasons?: string[]; risks?: string[]; evidenceNeeded?: string[] }>;
};

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function main() {
  const today = todayJst();
  const write = process.argv.includes("--write");
  const reflections = readJson<WorldEventReflection[]>("data/world_event_reflections_latest.json", []);
  const alpha = readJson<AlphaDataLike>("apps/web/public/generated/alpha-pon-data.json", {});
  const reviews = buildWorldImpactReviews({
    reflections,
    candidates: alpha.candidates ?? [],
    universeCandidates: (alpha.universeCandidates ?? []).map(candidate => ({
      code: candidate.code,
      name: candidate.name,
      sector: candidate.sector ?? null,
      tags: candidate.matchedWorldEventTags ?? [],
      reasons: candidate.warnings ?? [],
    })),
    generatedCompanyRules: alpha.generatedCompanyRules ?? [],
    today,
    limit: 8,
  });

  const existing = loadWorldImpactReviews();
  const merged = mergeExistingReviews(existing, reviews);
  const created = write ? saveWorldImpactReviews(reviews) : 0;
  const latest: WorldEventImpactReview[] = write ? mergeExistingReviews(loadWorldImpactReviews(), reviews) : merged;
  writeWorldImpactLatest(latest);

  mkdirSync("reports", { recursive: true });
  const report = {
    schemaVersion: 1,
    generatedAt: today,
    mode: write ? "write" : "dry-run",
    created,
    candidateReviews: reviews,
    totalLatest: latest.length,
    notes: [
      "世界ニュースを銘柄への影響仮説として保存する研究ログです。",
      "dry-run では JSONL へ追記しません。",
      "価格データ不足は未評価として扱います。",
    ],
  };
  writeFileSync(join("reports", "world-impact-review.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join("reports", "world-impact-review.md"), renderWorldImpactReviewMarkdown(reviews, today, write));

  console.log(`\n=== world impact review (${today}) ===`);
  console.log(`mode: ${write ? "write" : "dry-run"}`);
  console.log(`candidateReviews: ${reviews.length}`);
  console.log(`created: ${created}`);
  console.log("出力: reports/world-impact-review.md / reports/world-impact-review.json / data/world_event_impacts_latest.json");
}

main();
