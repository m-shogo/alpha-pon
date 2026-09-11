// src/**/*.ts が本番の起動経路から到達するかを検査する。
//
// 背景（2026-09-11 の実測）:
//   src/execution/ の3本（建玉サイズ / 売買シグナル / 紙トレード帳簿）は
//   テストからしか呼ばれていなかった。ロードマップには「✅ 実装済み」と
//   書いてある。**書いてあるのに動いていない** ことに気づく仕組みが無かった。
//   実際、帳簿には「約定より前の決済」を書き込めて、保有期間が負のまま
//   +1000bps の利益が計算できた。使われていないので誰も気づかない。
//
//   同じ失敗様式は過去に2回起きている:
//     - 権利落ち台帳を作ったが、指数も市場モデルも読んでいなかった
//     - verify script 21本がどのチェーンからも起動されていなかった
//
// ここでの「到達可能」:
//   package.json の scripts / scripts/*.sh / .github/workflows/*.yml の
//   いずれかから起動されるファイルを起点に、相対 import を辿って届くこと。
//   **テストから import されているだけでは到達とみなさない。**
//   テストが通ることと、本番で動くことは別。
//
// 落とす条件:
//   1. 既知一覧に無い未到達モジュールが増えた
//   2. 既知一覧の項目が到達可能になった（一覧が古い。消すこと）
//   3. 既知一覧の項目のファイルが消えた（一覧が古い。消すこと）

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();

const VALIDATE_WRAPPER_REASON =
  "単体デバッグ用の包み。validate.ts が同じ検証器を呼んでおり、"
  + "検査自体は pnpm research:validate で CI から走っている（2026-09-11 に確認）。";

/**
 * 本番から到達しないと分かっているモジュール。
 *
 * **この一覧は減らすためにある。** 増やすときは理由を書く。
 * 「2026-09-11 の棚卸し時点」は、その日に機械で数えた既存分で、
 * 一本ずつの事情は調べていない。調べたものは個別の理由に置き換える。
 */
const KNOWN_UNREACHABLE: Record<string, string> = {
  // --- 調査済み ---
  "src/execution/position-sizing.ts":
    "実行層。Edge が FDR を通るまで配線しない（2026-09-11 時点で通った Edge は無い）。",
  "src/execution/trade-signal.ts":
    "実行層。Edge が FDR を通るまで配線しない。",
  "src/execution/paper-trade-ledger.ts":
    "実行層。Edge が FDR を通るまで配線しない。",

  // 単体デバッグ用の薄い包み。`pnpm research:validate`（validate.ts）が
  // **同じ検証器を直接呼んでいる**ことを 2026-09-11 に確認した。
  // 検査自体は CI で走っているので、ここは配線漏れではない。
  "src/research/cli/validate-bitemporal-evidence.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-catalogs.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-claim-contradiction-graph.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-document-revision-diff.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-evidence-packages.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-foundation-decision-integrations.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-security-master.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-stock-pro-council-calibrations.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-stock-pro-council-ledgers.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-stock-pro-council-replays.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-stock-pro-council-v2.ts":
    VALIDATE_WRAPPER_REASON,
  "src/research/cli/validate-testable-hypothesis-scenarios.ts":
    VALIDATE_WRAPPER_REASON,

  // --- 2026-09-11 の棚卸し時点で未到達だった分（未調査） ---
};

const UNEXAMINED_MARKER = "2026-09-11 の棚卸し時点で未到達（未調査）。";

const UNEXAMINED = [
  "src/acquire-edinet-document.ts",
  "src/alignment-warning-summary.ts",
  "src/build-ui.ts",
  "src/research/bitemporal-evidence-governed.ts",
  "src/research/claim-contradiction-graph-writer.ts",
  "src/research/cli/finalize-edinet-foundation-mapping.ts",
  "src/research/cli/prepare-sanrio-edinet-revision-diff.ts",
  "src/research/cli/preview-reviewed-edinet.ts",
  "src/research/corporate-action-clearance.ts",
  "src/research/document-revision-diff-writer.ts",
  "src/research/edinet-foundation-mapping-edit-finalizer.ts",
  "src/research/outcome-learning-adoption-decision.ts",
  "src/research/outcome-learning-change-preparation.ts",
  "src/research/outcome-learning-decision.ts",
  "src/research/outcome-learning-proposal.ts",
  "src/research/outcome-learning-shadow-evaluation.ts",
  "src/research/outcome-learning-status.ts",
  "src/research/outcome-review-due.ts",
  "src/research/outcome-semantic-review.ts",
  "src/research/price-record-timeline.ts",
  "src/research/price-store-replay-guard.ts",
  "src/research/quantitative-outcome.ts",
  "src/research/recommendation-persistence.ts",
  "src/research/research-knowledge-catalog-writer.ts",
  "src/research/signals/backtest-bundle.ts",
  "src/research/signals/company-relations.ts",
  "src/research/signals/earnings-gap.ts",
  "src/research/signals/edge-decay.ts",
  "src/research/signals/gate-evidence.ts",
  "src/research/signals/read-across-events.ts",
  "src/research/signals/study-period-plan.ts",
  "src/research/stock-pro-council-calibration-hardening.ts",
  "src/research/stock-pro-council-replay-calibration.ts",
  "src/research/testable-hypothesis-scenario-writer.ts",
  "src/review-predictions.ts",
  "src/world-theme-candidate-review-result.ts",
];
for (const path of UNEXAMINED) KNOWN_UNREACHABLE[path] = UNEXAMINED_MARKER;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** CI・daily・手動 CLI のいずれかから「実行される」テキストを集める。 */
function launcherTexts(): string[] {
  const texts: string[] = [];
  const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = pkg.scripts ?? {};
  texts.push(Object.values(scripts).join("\n"));
  for (const path of walk("scripts")) {
    if (path.endsWith(".sh")) texts.push(readFileSync(path, "utf-8"));
  }
  for (const path of walk(".github/workflows")) {
    if (/\.ya?ml$/.test(path)) texts.push(readFileSync(path, "utf-8"));
  }
  // シェル・ワークフローから `pnpm <script>` で入る経路も展開する。
  for (const text of [...texts]) {
    for (const match of text.matchAll(/\bpnpm(?:\s+run)?\s+([a-z][a-z0-9:._-]*)/g)) {
      const command = scripts[match[1]!];
      if (command) texts.push(command);
    }
  }
  return texts;
}

function entryFiles(): string[] {
  const entries = new Set<string>();
  for (const text of launcherTexts()) {
    for (const match of text.matchAll(/\b((?:src|scripts)\/[A-Za-z0-9._/-]+\.ts)/g)) {
      entries.add(match[1]!);
    }
  }
  return [...entries].filter((path) => existsSync(path));
}

const IMPORT_PATTERN = /from\s+"(\.[^"]+)"|import\s*\(\s*"(\.[^"]+)"/g;

function reachableSrcFiles(): Set<string> {
  const reached = new Set<string>();
  const visited = new Set<string>();
  const stack = entryFiles();
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    if (file.startsWith("src/")) reached.add(file);
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(IMPORT_PATTERN)) {
      const spec = match[1] ?? match[2]!;
      const base = spec.replace(/\.js$/, "");
      for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
        const target = relative(ROOT, resolve(dirname(file), candidate));
        if (existsSync(target)) {
          stack.push(target);
          break;
        }
      }
    }
  }
  return reached;
}

const allSrc = walk("src").filter((path) => path.endsWith(".ts") && !path.endsWith(".d.ts"));
assert.ok(allSrc.length > 0, "src/**/*.ts が1本も見つからない。走査経路が壊れている");

const reached = reachableSrcFiles();
assert.ok(
  reached.size > allSrc.length / 2,
  `到達判定が壊れている疑い: ${reached.size}/${allSrc.length} しか到達しない`,
);

const unreachable = allSrc.filter((path) => !reached.has(path)).sort();
const problems: string[] = [];

for (const path of unreachable) {
  if (!(path in KNOWN_UNREACHABLE)) {
    problems.push(
      `未到達が増えた: ${path}\n`
      + "  本番のどこからも起動されない。配線するか、理由を添えて "
      + "scripts/verify-src-reachability.ts の KNOWN_UNREACHABLE に足すこと。",
    );
  }
}
for (const path of Object.keys(KNOWN_UNREACHABLE).sort()) {
  if (!existsSync(path)) {
    problems.push(`一覧が古い（ファイルが無い）: ${path} — KNOWN_UNREACHABLE から消すこと`);
  } else if (reached.has(path)) {
    problems.push(`一覧が古い（到達するようになった）: ${path} — KNOWN_UNREACHABLE から消すこと`);
  }
}

const unexamined = unreachable.filter(
  (path) => KNOWN_UNREACHABLE[path] === UNEXAMINED_MARKER,
).length;

console.log(
  `src 到達性: ${reached.size}/${allSrc.length} 到達 / 未到達 ${unreachable.length}`
  + `（うち未調査 ${unexamined}）`,
);

if (problems.length > 0) {
  console.error("");
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} 件。`);
  process.exit(1);
}
console.log("✓ 本番から到達しない src モジュールは、すべて既知の一覧に載っている");
