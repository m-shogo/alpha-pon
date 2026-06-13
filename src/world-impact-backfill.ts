// pnpm backfill:world-impact
// 既存の data/world_event_impacts.jsonl に v2 フィールドを安全に補完する。
// 既定は dry-run。--write の時だけ JSONL を正規化して書き戻す。
//
// 安全ルール:
//   - 既存値は一切上書きしない（欠損のみ補完）。normalize は冪等。
//   - レコードの削除・並べ替えはしない。
//   - 破損行（parse 不能）はそのまま保持し、件数を報告する。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import {
  normalizeWorldImpactReview,
  writeWorldImpactLatest,
  type WorldEventImpactReview,
} from "./world-impact.js";

const JSONL_PATH = join("data", "world_event_impacts.jsonl");

type LineEntry =
  | { kind: "review"; raw: string; before: Record<string, unknown>; after: WorldEventImpactReview }
  | { kind: "broken"; raw: string };

function main() {
  const today = todayJst();
  const write = process.argv.includes("--write");

  if (!existsSync(JSONL_PATH)) {
    console.log(`[backfill:world-impact] ${JSONL_PATH} がありません。補完対象なし。`);
    return;
  }

  const lines = readFileSync(JSONL_PATH, "utf-8").split("\n").filter(line => line.trim());
  // confidence の初期値は情報源の信頼度由来（builder と同じ規則）。検証前なので 0.6 上限。
  const CONFIDENCE_BY_SOURCE: Record<string, number> = { official: 0.6, tier1: 0.5, tier2: 0.4, unknown: 0.3 };

  const entries: LineEntry[] = lines.map(raw => {
    try {
      const before = JSON.parse(raw) as Record<string, unknown>;
      const after = normalizeWorldImpactReview(before, today);
      if (after.confidence == null) {
        after.confidence = CONFIDENCE_BY_SOURCE[after.sourceQuality] ?? 0.3;
      }
      return { kind: "review", raw, before, after };
    } catch {
      return { kind: "broken", raw };
    }
  });

  const broken = entries.filter(entry => entry.kind === "broken").length;
  const reviews = entries.filter((entry): entry is Extract<LineEntry, { kind: "review" }> => entry.kind === "review");

  // 補完されたフィールドの集計（before に無く after に入ったもの）
  const filledCounts = new Map<string, number>();
  const V2_FIELDS = ["mechanisms", "impactPath", "direction", "confidence", "expectedLagDays", "thesis", "falsification", "watchSignals", "riskFactors", "reviewDueAt", "reviewStatus"] as const;
  let changedRecords = 0;
  for (const entry of reviews) {
    let changed = false;
    for (const field of V2_FIELDS) {
      if (!(field in entry.before)) {
        filledCounts.set(field, (filledCounts.get(field) ?? 0) + 1);
        changed = true;
      }
    }
    if (entry.before.confidence == null && entry.after.confidence != null) {
      filledCounts.set("confidence(初期値)", (filledCounts.get("confidence(初期値)") ?? 0) + 1);
      changed = true;
    }
    const outcomes = Array.isArray(entry.before.outcomes) ? entry.before.outcomes as Array<Record<string, unknown>> : [];
    if (outcomes.some(outcome => !("missReason" in outcome))) {
      filledCounts.set("outcomes.missReason", (filledCounts.get("outcomes.missReason") ?? 0) + 1);
      changed = true;
    }
    // v3 評価フィールド（evaluatedAt を代表キーとして欠損検出）
    if (outcomes.some(outcome => !("evaluatedAt" in outcome))) {
      filledCounts.set("outcomes.v3評価フィールド", (filledCounts.get("outcomes.v3評価フィールド") ?? 0) + 1);
      changed = true;
    }
    if (changed) changedRecords++;
  }

  if (write && changedRecords > 0) {
    const output = entries.map(entry =>
      entry.kind === "broken" ? entry.raw : JSON.stringify(entry.after)
    );
    writeFileSync(JSONL_PATH, output.join("\n") + "\n", "utf-8");
    // latest はマージ更新（review:world-impact の dry-run 候補を消さない）
    const LATEST_PATH = join("data", "world_event_impacts_latest.json");
    let latest: WorldEventImpactReview[] = [];
    try {
      latest = existsSync(LATEST_PATH) ? JSON.parse(readFileSync(LATEST_PATH, "utf-8")) as WorldEventImpactReview[] : [];
    } catch {
      latest = [];
    }
    const updatedByKey = new Map(reviews.map(entry => [entry.after.reviewKey, entry.after]));
    const merged = latest.map(item => updatedByKey.get(item.reviewKey) ?? item);
    for (const [key, review] of updatedByKey) {
      if (!merged.some(item => item.reviewKey === key)) merged.push(review);
    }
    writeWorldImpactLatest(merged);
  }

  mkdirSync("reports", { recursive: true });
  const report = {
    schemaVersion: 1,
    generatedAt: today,
    mode: write ? "write" : "dry-run",
    totalRecords: reviews.length,
    brokenLines: broken,
    changedRecords,
    filledFields: Object.fromEntries(filledCounts),
    notes: [
      "既存値は上書きせず、欠損フィールドのみ補完します。",
      "dry-run では JSONL を変更しません。",
      "破損行は変更せず保持します。pnpm audit:world-impact で検出されます。",
    ],
  };
  writeFileSync(join("reports", "world-impact-backfill.json"), JSON.stringify(report, null, 2) + "\n");

  console.log(`\n=== world impact backfill (${today}) ===`);
  console.log(`mode: ${report.mode}`);
  console.log(`totalRecords: ${report.totalRecords}`);
  console.log(`brokenLines: ${report.brokenLines}`);
  console.log(`changedRecords: ${report.changedRecords}`);
  for (const [field, count] of filledCounts) console.log(`  + ${field}: ${count}件補完${write ? "" : "予定"}`);
  if (!write && changedRecords > 0) {
    console.log("\ndry-run: 変更していません。--write で補完を実行します。");
  }
  if (write && changedRecords > 0) {
    console.log("JSONL と latest を更新しました。");
  }
  if (changedRecords === 0) {
    console.log("補完対象なし（すでに v2 フィールドが揃っています）。");
  }
}

main();
