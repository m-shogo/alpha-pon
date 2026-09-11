// scripts/verify-*.{ts,sh} が、CI からどこも起動しないまま放置されるのを防ぐ。
//
// 背景:
//   2026-09-10 の監査で、market-event コアの verify 21本がどのチェーンからも
//   起動されていなかった。さらに ci-pipeline-smoke.sh は set -e を持たず、
//   並んでいた15本も実質強制されていなかった（中で落ちても exit 0）。
//   「追記し忘れ」と「失敗が素通りする」が同時に起きていた。
//
// ここでの「到達可能」は **GitHub Actions のワークフローから実際に実行される**
// という意味に限定する。ローカル手動用のスクリプトから参照されているだけでは
// 到達可能とみなさない（それでは CI で守られていることにならない）。
//
// 探索経路:
//   .github/workflows/*.yml
//     → `pnpm <script>`      : package.json の scripts を辿る
//     → `bash scripts/*.sh`  : そのシェルスクリプトの中身を辿る
//     → `node ... scripts/*.ts` : verify script として記録し、import も辿る

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const SCRIPTS_DIR = resolve(process.cwd(), "scripts");

const WORKFLOWS = [
  ".github/workflows/ci.yml",
  ".github/workflows/check.yml",
  ".github/workflows/research-os.yml",
  ".github/workflows/sync-cloudflare-d1-market-events.yml",
];

/** CI から意図的に実行しないもの。理由を必ず書く。 */
const EXPECTED_UNREACHABLE: Record<string, string> = {
  "verify-cloudflare-production":
    "本番 Cloudflare へ実アクセスする。CI から自動実行しない（手動運用の runbook 用）。",
  "verify-cloudflare-calendar-readiness":
    "Cloudflare Pages 用の経路。Workers Static Assets へ移行済みでレガシー。",
  "verify-pages-market-event-function":
    "Cloudflare Pages Functions 用の経路。Workers Static Assets へ移行済みでレガシー。",
  "verify-pro-local":
    "ローカル手動検証用のラッパー。CI では個別の検査を直接起動している。",
  "verify-price-store-vs-api":
    "J-Quants API へ実アクセスする（キーとネットワークが要る）。"
    + "バースト枠があるので日付ごとに20秒空ける。"
    + "mapJQuantsFreeQuote を触ったときに手で回す運用。",
};

function listVerifyScripts(): string[] {
  return readdirSync(SCRIPTS_DIR)
    .filter((name) => /^verify-.*\.(ts|sh)$/.test(name))
    .map((name) => name.replace(/\.(ts|sh)$/, ""))
    .sort();
}

function readIfExists(relativePath: string): string | null {
  const path = resolve(process.cwd(), relativePath);
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

const packageScripts: Record<string, string> = (() => {
  const raw = readIfExists("package.json");
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
  return parsed.scripts ?? {};
})();

// 「言及」ではなく「実行」だけを到達とみなす。
// shellcheck の引数のような単なるファイル名の列挙を実行と誤認しないため、
// 実行動詞（node / bash / sh / ./）を要求する。
const NODE_EXEC_PATTERN = /\bnode\s[^\n]*?scripts\/([A-Za-z0-9._-]+\.ts)/g;
const SHELL_EXEC_PATTERN = /(?:^|[\s;&|(])(?:bash|sh|\.\/)\s*scripts\/([A-Za-z0-9._-]+\.sh)/gm;
const PNPM_PATTERN = /\bpnpm(?:\s+run)?\s+([a-z][a-z0-9:._-]*)/g;
const IMPORT_PATTERN = /import\s+"\.\/([A-Za-z0-9._-]+)\.js"/g;

/** CI から実行される経路を推移的に辿り、触れた scripts/*.ts|sh を集める。 */
function collectReachableScriptFiles(): Set<string> {
  const touched = new Set<string>();
  const visitedTexts = new Set<string>();
  const pendingTexts: Array<{ label: string; text: string }> = [];

  for (const workflow of WORKFLOWS) {
    const text = readIfExists(workflow);
    if (text) pendingTexts.push({ label: workflow, text });
  }

  while (pendingTexts.length > 0) {
    const { label, text } = pendingTexts.pop()!;
    if (visitedTexts.has(label)) continue;
    visitedTexts.add(label);

    for (const pattern of [NODE_EXEC_PATTERN, SHELL_EXEC_PATTERN]) {
      for (const match of text.matchAll(pattern)) {
        const file = match[1];
        if (touched.has(file)) continue;
        touched.add(file);
        const nested = readIfExists(`scripts/${file}`);
        if (nested) pendingTexts.push({ label: `scripts/${file}`, text: nested });
      }
    }

    for (const match of text.matchAll(PNPM_PATTERN)) {
      const scriptName = match[1];
      const body = packageScripts[scriptName];
      if (body !== undefined) pendingTexts.push({ label: `package.json:${scriptName}`, text: body });
    }
  }

  // verify script が別の verify script を import している場合も到達可能。
  const stack = [...touched].filter((file) => file.endsWith(".ts"));
  while (stack.length > 0) {
    const file = stack.pop()!;
    const source = readIfExists(`scripts/${file}`);
    if (!source) continue;
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const imported = `${match[1]}.ts`;
      if (touched.has(imported) || !existsSync(join(SCRIPTS_DIR, imported))) continue;
      touched.add(imported);
      stack.push(imported);
    }
  }

  return touched;
}

const all = listVerifyScripts();
const touchedFiles = collectReachableScriptFiles();
const reachable = new Set(
  [...touchedFiles]
    .filter((file) => file.startsWith("verify-"))
    .map((file) => file.replace(/\.(ts|sh)$/, "")),
);
const unreachable = all.filter((name) => !reachable.has(name));

const unexpected = unreachable.filter((name) => !(name in EXPECTED_UNREACHABLE));
assert.deepEqual(
  unexpected,
  [],
  "CI からどこも起動しない verify script があります。\n"
  + "  ci-pipeline-smoke.sh 等へ追加するか、理由を EXPECTED_UNREACHABLE へ明示してください:\n"
  + unexpected.map((name) => `    - ${name}`).join("\n"),
);

const nowReachable = Object.keys(EXPECTED_UNREACHABLE).filter((name) => reachable.has(name));
assert.deepEqual(
  nowReachable,
  [],
  "EXPECTED_UNREACHABLE に載っているのに CI から起動されています。\n"
  + "  リストから削除してください:\n"
  + nowReachable.map((name) => `    - ${name}`).join("\n"),
);

const stale = Object.keys(EXPECTED_UNREACHABLE).filter((name) => !all.includes(name));
assert.deepEqual(stale, [], `EXPECTED_UNREACHABLE に存在しないファイルが載っています: ${stale.join(", ")}`);

console.log(
  `verify-script-reachability: ok `
  + `(${all.length}本中 ${all.length - unreachable.length}本が CI から到達可能 / 意図的な除外 ${unreachable.length}本)`,
);
