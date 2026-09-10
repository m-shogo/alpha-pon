// tests/ 配下のテストを漏れなく実行する。
//
//   node --import tsx/esm scripts/run-all-tests.ts
//   node --import tsx/esm scripts/run-all-tests.ts --concurrency=8
//
// 背景:
//   2026-09-10 の監査で、475本のテストのうち139本(29%)がどのチェーンからも
//   実行されていないことが判明した。うち14本は既に失敗しており、
//   誰も気づかないまま regression が入り込んでいた。
//   (例: tests/research/evidence-package-repository-invalid-revision-ledger.test.ts は
//        PR #450 追加時は通っていたが、その後 main で落ちるようになっていた)
//
// 方針:
//   - glob で全部拾う。チェーンへの追記忘れという失敗様式そのものを無くす
//   - 既知の失敗は tests/known-failures.json に理由付きで明示する
//   - 既知失敗が **通った** 場合もエラーにする。リストが自然に縮む方向へ力をかける

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const TEST_ROOT = resolve(process.cwd(), "tests");
const KNOWN_FAILURES_PATH = resolve(process.cwd(), "tests/known-failures.json");
const DEFAULT_CONCURRENCY = 8;

type KnownFailure = { path: string; reason: string };
type Prerequisite = { script: string; reason: string };

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : null;
}

function collectTestFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTestFiles(full, out);
      continue;
    }
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.mjs")) {
      out.push(relative(process.cwd(), full));
    }
  }
  return out;
}

function loadConfig(): { knownFailures: KnownFailure[]; prerequisites: Prerequisite[] } {
  if (!existsSync(KNOWN_FAILURES_PATH)) return { knownFailures: [], prerequisites: [] };
  const parsed = JSON.parse(readFileSync(KNOWN_FAILURES_PATH, "utf-8")) as {
    knownFailures?: KnownFailure[];
    prerequisites?: Prerequisite[];
  };
  return { knownFailures: parsed.knownFailures ?? [], prerequisites: parsed.prerequisites ?? [] };
}

/** 生成物を前提にするテストがあるため、先に生成コマンドを流す。 */
function runPrerequisite(prerequisite: Prerequisite): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const child = spawn("pnpm", [prerequisite.script], { env: process.env, stdio: "ignore" });
    child.on("close", (code) => resolvePromise(code === 0));
    child.on("error", () => resolvePromise(false));
  });
}

function knownFailureMap(rows: KnownFailure[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.path !== "string" || typeof row.reason !== "string" || row.reason.trim() === "") {
      throw new Error(`known-failures.json entries need a path and a non-empty reason: ${JSON.stringify(row)}`);
    }
    if (map.has(row.path)) throw new Error(`duplicate known failure: ${row.path}`);
    map.set(row.path, row.reason);
  }
  return map;
}

function runOne(file: string): Promise<{ file: string; ok: boolean; output: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ["--import", "tsx/esm", file], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("close", (code) => resolvePromise({ file, ok: code === 0, output }));
    child.on("error", (error) => resolvePromise({ file, ok: false, output: String(error) }));
  });
}

async function runAll(files: string[], concurrency: number) {
  const results: Array<{ file: string; ok: boolean; output: string }> = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      results.push(await runOne(files[index]));
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  const concurrency = Number(argValue("concurrency") ?? DEFAULT_CONCURRENCY);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error(`--concurrency must be an integer between 1 and 32: ${concurrency}`);
  }

  const config = loadConfig();
  const known = knownFailureMap(config.knownFailures);
  const files = collectTestFiles(TEST_ROOT);

  for (const prerequisite of config.prerequisites) {
    const ok = await runPrerequisite(prerequisite);
    if (!ok) {
      throw new Error(`prerequisite failed: pnpm ${prerequisite.script} (${prerequisite.reason})`);
    }
  }

  const missingFromTree = [...known.keys()].filter((path) => !files.includes(path));
  if (missingFromTree.length > 0) {
    throw new Error(`known-failures.json lists files that no longer exist:\n  ${missingFromTree.join("\n  ")}`);
  }

  const startedAt = Date.now();
  const results = await runAll(files, concurrency);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  const unexpectedFailures = results.filter((one) => !one.ok && !known.has(one.file));
  const unexpectedPasses = results.filter((one) => one.ok && known.has(one.file));
  const expectedFailures = results.filter((one) => !one.ok && known.has(one.file));

  console.log(`tests: ${files.length}件 / ${elapsedSec}s (concurrency=${concurrency})`);
  console.log(`  想定内の失敗: ${expectedFailures.length}件`);

  for (const failure of unexpectedFailures) {
    console.log(`\n=== FAIL ${failure.file} ===`);
    console.log(failure.output.trim().split("\n").slice(-12).join("\n"));
  }
  for (const pass of unexpectedPasses) {
    console.log(`\n=== 既知失敗が通りました: ${pass.file}`);
    console.log(`    理由欄: ${known.get(pass.file)}`);
    console.log("    tests/known-failures.json から削除してください。");
  }

  if (unexpectedFailures.length > 0 || unexpectedPasses.length > 0) {
    console.log(
      `\nrun-all-tests: 予期しない失敗 ${unexpectedFailures.length}件 / 既知失敗の解消 ${unexpectedPasses.length}件`,
    );
    process.exit(1);
  }

  console.log("run-all-tests: ok");
}

await main();
