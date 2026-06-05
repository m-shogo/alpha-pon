// 特殊状況ウォッチ outcome seed
// noOutcomeRecord 候補（hypothesis_outcomes.jsonl に対応する行がない候補）に対して
// 検証用の outcome seed を安全に作成する。
//
// 使い方:
//   pnpm seed:special-outcomes          → dry-run（何も書き換えない）
//   pnpm seed:special-outcomes --write  → 実際に追加
//
// 安全ルール:
//   - dry-run では絶対にファイルを変更しない
//   - --write 前に pnpm backup を実行、backup 失敗なら停止
//   - 既存行を削除しない・上書きしない
//   - 重複行を追加しない

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { load } from "js-yaml";
import { addDaysJst, todayJst } from "./date.js";
import type { HypothesisOutcome, ReviewHorizon, StockCandidateHypothesis } from "./universe.js";

const OUTCOME_PATH = "data/hypothesis_outcomes.jsonl";
const REPORT_DIR = "reports";

// special situation 識別マーカー（hypothesis.reason の先頭に付与）
const SPECIAL_SITUATION_MARKER = "[special_situation]";

// ─────────── 型定義 ───────────

type SeedPreviewItem = {
  code: string;
  name: string;
  horizons: ReviewHorizon[];
  detectedAt: string;
  outcomeKeys: string[];
  willWrite: boolean;
  reason: string;
};

type SkippedItem = {
  code: string;
  name: string;
  reason:
    | "already_has_special_outcome"
    | "ambiguous_duplicate"
    | "missing_candidate_data"
    | "not_seedable";
  detail: string;
};

type SpecialSituationOutcomeSeedReport = {
  generatedAt: string;
  dryRun: boolean;
  summary: {
    candidates: number;
    existingSpecialOutcomes: number;
    seedableCandidates: number;
    seedableOutcomes: number;
    createdOutcomes: number;
    skippedCandidates: number;
    ambiguousDuplicates: number;
  };
  seedPreview: SeedPreviewItem[];
  skipped: SkippedItem[];
  notes: string[];
};

// ─────────── ヘルパ ───────────

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => JSON.parse(l) as T);
}

function readYaml<T>(path: string): T {
  return load(readFileSync(path, "utf-8")) as T;
}

/** outcome が special_situation 由来かどうか判定 */
function isSpecialSituationOutcome(outcome: HypothesisOutcome): boolean {
  return outcome.hypothesis.reason?.includes(SPECIAL_SITUATION_MARKER) ?? false;
}

/** outcome の重複キー */
function outcomeKey(code: string, detectedAt: string, horizon: ReviewHorizon): string {
  return `${code}:${detectedAt}:${horizon}`;
}

/** detectedAt を決める: listingInfo.listedAt があればそれ、なければ today */
function resolveDetectedAt(
  listedAt: string | null | undefined,
  today: string
): { date: string; source: string } {
  if (listedAt && listedAt.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // 古すぎる（2年以上前）なら today を使う
    const listed = new Date(listedAt);
    const todayDate = new Date(today);
    const ageDays = Math.floor((todayDate.getTime() - listed.getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays > 730) {
      return { date: today, source: `listedAt(${listedAt}) が 2年以上前のため today を使用` };
    }
    return { date: listedAt, source: `listingInfo.listedAt: ${listedAt}` };
  }
  return { date: today, source: "listingInfo.listedAt なし → today を使用" };
}

/** seed 用の StockCandidateHypothesis を組み立て */
function buildSeedHypothesis(
  code: string,
  name: string,
  detectedAt: string,
  horizon: ReviewHorizon,
  reasonSummary: string,
  patterns: string[],
  evidenceNeeded: string[]
): StockCandidateHypothesis {
  const horizonDays: Record<ReviewHorizon, number> = { "1d": 1, "1w": 7, "1m": 30, "3m": 90 };
  const timeframeMap: Record<ReviewHorizon, "1w" | "1m" | "3m"> = {
    "1d": "1w", "1w": "1w", "1m": "1m", "3m": "3m",
  };
  return {
    schemaVersion: 1,
    code,
    name,
    detectedAt,
    reviewDueAt: addDaysJst(detectedAt, horizonDays[horizon]),
    reason: `${SPECIAL_SITUATION_MARKER} 特殊状況ウォッチ: ${reasonSummary}`,
    expectedTimeframe: timeframeMap[horizon],
    expectedDirection: "unknown",
    confidence: 0.5,
    invalidationSignals: ["特殊状況の前提条件崩れ", "売り圧が予想より強く継続"],
    evidenceNeeded: evidenceNeeded.slice(0, 5),
    relatedWorldEventIds: patterns,
    relatedDisclosureIds: [],
    status: "open",
    label: "検証候補",
  };
}

/** seed 用の HypothesisOutcome を組み立て */
function buildSeedOutcome(
  code: string,
  name: string,
  hypothesis: StockCandidateHypothesis,
  horizon: ReviewHorizon,
  today: string
): HypothesisOutcome {
  return {
    schemaVersion: 1,
    code,
    name,
    hypothesis,
    evaluatedAt: today,
    reviewHorizon: horizon,
    actionLabel: "watch",
    scoreAtPrediction: null,
    startPrice: null,
    endPrice1d: null,
    endPrice1w: null,
    endPrice1m: null,
    endPrice3m: null,
    return1d: null,
    return1w: null,
    return1m: null,
    return3m: null,
    topixReturn1d: null,
    benchmarkReturn1w: null,
    benchmarkReturn3m: null,
    topixReturn1m: null,
    relativeToTopix1d: null,
    relativeToTopix1w: null,
    relativeToTopix1m: null,
    relativeToTopix3m: null,
    maxDrawdownPct: null,
    actualDirection: "unknown",
    result: "unknown",
    dataAvailability: "missing",
    whatMatched: [],
    whatDiffered: [],
    missedSignals: [],
    improvedRuleIdeas: [],
    notes: `特殊状況ウォッチ seed。pnpm backfill:special-outcomes で価格データを補完予定。`,
    dataSource: "mock",
  };
}

// ─────────── メイン ───────────

async function main(): Promise<void> {
  const doWrite = process.argv.includes("--write");
  const today = todayJst();

  console.log(`[seed:special-outcomes] mode=${doWrite ? "WRITE" : "DRY-RUN"}`);

  // --write 前に backup 確認
  if (doWrite) {
    console.log("[WARN] --write モードです。backup を確認中...");
    try {
      execSync("pnpm backup", { stdio: "pipe" });
      console.log("[OK] backup 完了");
    } catch (e) {
      console.error("[ERROR] pnpm backup が失敗しました。--write を中断します。");
      process.exit(1);
    }
  }

  // YAML 候補読み込み
  type PatternDef = {
    id: string;
    evidenceNeeded?: string[];
  };
  type CandidateEntry = {
    code: string;
    name: string;
    patterns?: string[];
    reasonSummary?: string;
    listingInfo?: { listedAt?: string | null };
  };
  type Config = { candidates?: CandidateEntry[]; patterns?: PatternDef[] };
  const config = readYaml<Config>("config/special-situation-watch-rules.yml");
  const candidates = config.candidates ?? [];
  const patternDefs = config.patterns ?? [];
  const patternEvidenceMap = new Map(patternDefs.map(p => [p.id, p.evidenceNeeded ?? []]));

  // 既存 outcomes 読み込み
  const existingOutcomes = readJsonl<HypothesisOutcome>(OUTCOME_PATH);

  // special situation 既存 outcomes
  const existingSpecial = existingOutcomes.filter(isSpecialSituationOutcome);

  // 重複判定セット（special のみ）
  const specialKeys = new Set(
    existingSpecial.map(o => outcomeKey(o.code, o.hypothesis.detectedAt, o.reviewHorizon))
  );

  // 通常 outcomes の code+detectedAt+horizon セット（ambiguous duplicate 判定用）
  const normalKeys = new Set(
    existingOutcomes
      .filter(o => !isSpecialSituationOutcome(o))
      .map(o => outcomeKey(o.code, o.hypothesis.detectedAt, o.reviewHorizon))
  );

  const SEED_HORIZONS: ReviewHorizon[] = ["1d", "1w", "1m"];

  const seedPreview: SeedPreviewItem[] = [];
  const skipped: SkippedItem[] = [];
  const seedsToWrite: HypothesisOutcome[] = [];

  for (const c of candidates) {
    if (!c.code || !c.name) {
      skipped.push({
        code: c.code ?? "?",
        name: c.name ?? "?",
        reason: "missing_candidate_data",
        detail: "code または name が設定されていません",
      });
      continue;
    }

    // コードごとの既存 special outcomes
    const existingSpecialForCode = existingSpecial.filter(o => o.code === c.code);
    const existingHorizons = new Set(existingSpecialForCode.map(o => o.reviewHorizon));

    // 全 horizon が埋まっている場合はスキップ
    const missingHorizons = SEED_HORIZONS.filter(h => !existingHorizons.has(h));
    if (missingHorizons.length === 0) {
      skipped.push({
        code: c.code,
        name: c.name,
        reason: "already_has_special_outcome",
        detail: `全 horizon (${SEED_HORIZONS.join("/")} ) の special outcome が存在します`,
      });
      continue;
    }

    // detectedAt 決定
    const { date: detectedAt, source: detectedAtSource } = resolveDetectedAt(
      c.listingInfo?.listedAt,
      today
    );

    // horizon ごとに作成するキーを確認
    const newOutcomeKeys: string[] = [];
    const horizonsToSeed: ReviewHorizon[] = [];
    const ambiguousHorizons: ReviewHorizon[] = [];

    for (const horizon of missingHorizons) {
      const key = outcomeKey(c.code, detectedAt, horizon);
      if (specialKeys.has(key)) {
        // 既存 special
        continue;
      }
      if (normalKeys.has(key)) {
        // ambiguous: 同じキーの通常 outcome が存在する
        ambiguousHorizons.push(horizon);
      } else {
        horizonsToSeed.push(horizon);
        newOutcomeKeys.push(key);
      }
    }

    if (ambiguousHorizons.length > 0) {
      skipped.push({
        code: c.code,
        name: c.name,
        reason: "ambiguous_duplicate",
        detail: `同じ code:detectedAt:horizon の通常 outcome が存在 (${ambiguousHorizons.join(",")}) → skip。reason などで確認が必要`,
      });
    }

    if (horizonsToSeed.length === 0) {
      if (ambiguousHorizons.length === 0 && missingHorizons.length > 0) {
        skipped.push({
          code: c.code,
          name: c.name,
          reason: "already_has_special_outcome",
          detail: "追加が必要な horizon はありません",
        });
      }
      continue;
    }

    // evidenceNeeded を patterns から集約
    const evidenceNeeded = Array.from(
      new Set((c.patterns ?? []).flatMap(pid => patternEvidenceMap.get(pid) ?? []))
    ).slice(0, 5);

    const preview: SeedPreviewItem = {
      code: c.code,
      name: c.name,
      horizons: horizonsToSeed,
      detectedAt,
      outcomeKeys: newOutcomeKeys,
      willWrite: doWrite,
      reason: `detectedAt: ${detectedAt} (${detectedAtSource})`,
    };
    seedPreview.push(preview);

    if (doWrite) {
      for (const horizon of horizonsToSeed) {
        const hyp = buildSeedHypothesis(
          c.code,
          c.name,
          detectedAt,
          horizon,
          c.reasonSummary ?? `${c.code} 特殊状況候補`,
          c.patterns ?? [],
          evidenceNeeded
        );
        const outcome = buildSeedOutcome(c.code, c.name, hyp, horizon, today);
        seedsToWrite.push(outcome);
      }
    }
  }

  // --write: JSONL に追記
  let createdCount = 0;
  if (doWrite && seedsToWrite.length > 0) {
    // 最終チェック: 書き込む前にもう一度重複確認
    const finalExisting = readJsonl<HypothesisOutcome>(OUTCOME_PATH);
    const finalKeys = new Set(
      finalExisting.map(o => outcomeKey(o.code, o.hypothesis.detectedAt, o.reviewHorizon))
    );
    const toWrite = seedsToWrite.filter(
      s => !finalKeys.has(outcomeKey(s.code, s.hypothesis.detectedAt, s.reviewHorizon))
    );
    if (toWrite.length > 0) {
      const appended = toWrite.map(o => JSON.stringify(o)).join("\n") + "\n";
      const existing = existsSync(OUTCOME_PATH) ? readFileSync(OUTCOME_PATH, "utf-8") : "";
      writeFileSync(OUTCOME_PATH, existing + appended, "utf-8");
      createdCount = toWrite.length;
      console.log(`[write] ${createdCount}件の seed outcome を追加しました`);
    } else {
      console.log("[write] 重複チェックにより追加対象がありませんでした");
    }
  } else if (doWrite) {
    console.log("[write] 作成対象がありませんでした");
  }

  // notes
  const notes: string[] = [
    "このレポートは検証データ整備のためのもの。売買推奨ではありません。",
    `[special_situation] マーカーを hypothesis.reason に付与して識別します。`,
  ];
  if (!doWrite) {
    notes.push("dry-run: data/hypothesis_outcomes.jsonl は変更されていません。--write で実行する場合は先に pnpm backup を実行してください。");
  }
  if (seedPreview.length > 0 && !doWrite) {
    notes.push(`dry-run で ${seedPreview.reduce((n, p) => n + p.horizons.length, 0)}件の seed outcome を作成可能と判断しました。`);
  }
  if (skipped.some(s => s.reason === "ambiguous_duplicate")) {
    notes.push("ambiguous_duplicate: 同じ code:detectedAt:horizon の通常 outcome が存在するため skip。手動確認が必要です。");
  }

  const seedableCount = seedPreview.length;
  const seedableOutcomes = seedPreview.reduce((n, p) => n + p.horizons.length, 0);
  const ambiguousDuplicates = skipped.filter(s => s.reason === "ambiguous_duplicate").length;

  const report: SpecialSituationOutcomeSeedReport = {
    generatedAt: today,
    dryRun: !doWrite,
    summary: {
      candidates: candidates.length,
      existingSpecialOutcomes: existingSpecial.length,
      seedableCandidates: seedableCount,
      seedableOutcomes,
      createdOutcomes: createdCount,
      skippedCandidates: skipped.length,
      ambiguousDuplicates,
    },
    seedPreview,
    skipped,
    notes,
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, "special_situation_outcome_seed_latest.json"), JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(join(REPORT_DIR, "special_situation_outcome_seed_latest.md"), renderMarkdown(report), "utf-8");

  console.log(`\n=== seed summary ===`);
  console.log(`candidates: ${report.summary.candidates}`);
  console.log(`existingSpecialOutcomes: ${report.summary.existingSpecialOutcomes}`);
  console.log(`seedableCandidates: ${report.summary.seedableCandidates}`);
  console.log(`seedableOutcomes: ${report.summary.seedableOutcomes}`);
  console.log(`createdOutcomes: ${report.summary.createdOutcomes}`);
  console.log(`skippedCandidates: ${report.summary.skippedCandidates}`);
  console.log(`ambiguousDuplicates: ${report.summary.ambiguousDuplicates}`);
  if (!doWrite) {
    console.log("\ndry-run: data/hypothesis_outcomes.jsonl は変更されていません。");
  }
}

function renderMarkdown(report: SpecialSituationOutcomeSeedReport): string {
  const lines: string[] = [];
  lines.push("# 特殊状況 outcome seed レポート", "");
  lines.push(`date: ${report.generatedAt}`, "");
  lines.push(`dryRun: ${report.dryRun}`, "");
  lines.push("> ※売買推奨ではありません。検証用 outcome を作成するための dry-run レポートです。", "");

  lines.push("## summary", "");
  lines.push("| item | count |");
  lines.push("|---|---:|");
  lines.push(`| candidates | ${report.summary.candidates} |`);
  lines.push(`| existingSpecialOutcomes | ${report.summary.existingSpecialOutcomes} |`);
  lines.push(`| seedableCandidates | ${report.summary.seedableCandidates} |`);
  lines.push(`| seedableOutcomes | ${report.summary.seedableOutcomes} |`);
  lines.push(`| createdOutcomes | ${report.summary.createdOutcomes} |`);
  lines.push(`| skippedCandidates | ${report.summary.skippedCandidates} |`);
  lines.push(`| ambiguousDuplicates | ${report.summary.ambiguousDuplicates} |`);
  lines.push("");

  lines.push("## seed preview", "");
  if (report.seedPreview.length === 0) {
    lines.push("- 作成対象なし（全候補が skip または既存 special outcome あり）", "");
  } else {
    lines.push("| code | name | horizons | detectedAt | willWrite | reason |");
    lines.push("|---|---|---|---|---|---|");
    for (const item of report.seedPreview) {
      lines.push(`| ${item.code} | ${item.name} | ${item.horizons.join("/")} | ${item.detectedAt} | ${item.willWrite} | ${item.reason.slice(0, 60)} |`);
    }
    lines.push("");
  }

  lines.push("## skipped", "");
  if (report.skipped.length === 0) {
    lines.push("- なし", "");
  } else {
    lines.push("| code | name | reason | detail |");
    lines.push("|---|---|---|---|");
    for (const item of report.skipped) {
      lines.push(`| ${item.code} | ${item.name} | ${item.reason} | ${item.detail.slice(0, 70)} |`);
    }
    lines.push("");
  }

  if (report.notes.length > 0) {
    lines.push("## notes", "");
    for (const note of report.notes) lines.push(`- ${note}`);
    lines.push("");
  }

  lines.push("## 次のアクション", "");
  lines.push("```");
  lines.push("# noOutcomeRecord がある場合のフロー:");
  lines.push("1. pnpm review:special-due             # noOutcomeRecord を確認");
  lines.push("2. pnpm seed:special-outcomes           # dry-run で安全確認");
  lines.push("3. pnpm backup                          # バックアップ（--write 前に必須）");
  lines.push("4. pnpm seed:special-outcomes --write   # outcome seed を作成");
  lines.push("5. pnpm review:special-due              # due queue に乗るか確認");
  lines.push("6. 期限後に:");
  lines.push("   pnpm backfill:special-outcomes --write  # 価格データを補完");
  lines.push("7. pnpm watch:special                   # outcomeStats を再確認");
  lines.push("```");
  lines.push("");
  lines.push(`*special situation outcome seed | ${report.generatedAt} | ※売買推奨ではありません*`);
  return lines.join("\n");
}

main().catch(err => {
  console.error("[ERROR]", err);
  process.exit(1);
});
