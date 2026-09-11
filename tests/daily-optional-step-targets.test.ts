// daily の非致命ステップが、実在するファイルを指しているかの検査。
//
// なぜ要るか:
//   `run_optional_step` は失敗してもレポートを止めない。それは正しい設計だが、
//   **パスを打ち間違えると毎朝静かに失敗し続けても誰も気づかない。**
//   ファイルを移動・改名したときも同じ。
//
//   実測で48件の非致命ステップがある。ここが腐っても朝のレポートは
//   出続けるので、腐ったことが分からない。
//
// 実データもネットワークも使わず、参照先の存在だけ見る。

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = "scripts/run-daily-complete.sh";

interface OptionalStep {
  name: string;
  referencedPaths: string[];
}

/** `\` による行継続をつないでから読む。継続を無視すると参照を取りこぼす。 */
export function parseOptionalSteps(source: string): OptionalStep[] {
  const joined = source.replace(/\\\n\s*/g, " ");
  const steps: OptionalStep[] = [];
  for (const line of joined.split("\n")) {
    const match = /^run_optional_step\s+"([^"]+)"(.*)$/.exec(line.trim());
    if (!match) continue;
    const referencedPaths = [...match[2]!.matchAll(/"\$DIR\/([^"]+)"/g)].map((one) => one[1]!);
    steps.push({ name: match[1]!, referencedPaths });
  }
  return steps;
}

function testEveryReferencedFileExists(): void {
  const steps = parseOptionalSteps(readFileSync(resolve(process.cwd(), SCRIPT), "utf-8"));
  assert.ok(steps.length > 20, `非致命ステップが少なすぎる（${steps.length}）。解析が壊れている疑い`);

  const missing: string[] = [];
  for (const step of steps) {
    for (const path of step.referencedPaths) {
      // .env は環境ごとに有無が変わるので対象外。
      if (path === ".env") continue;
      if (!existsSync(resolve(process.cwd(), path))) missing.push(`${step.name}: ${path}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    "daily の非致命ステップが存在しないファイルを指しています。\n"
    + "  失敗してもレポートは出続けるので、気づかないまま毎朝失敗します:\n"
    + missing.map((one) => `    - ${one}`).join("\n"),
  );
}

function testHelperIsDefinedBeforeFirstUse(): void {
  // bash は定義前に関数を呼ぶと "command not found" になる。
  // **`bash -n`（構文チェック）では気づけない。**
  //
  // 実際に踏んだ: 研究用データの追いつきを critical より前へ移したとき、
  // `run_optional_step` の定義（116行）より手前（91行）で呼んでいた。
  const lines = readFileSync(resolve(process.cwd(), SCRIPT), "utf-8").split("\n");
  let definedAt: number | null = null;
  let firstUseAt: number | null = null;
  for (const [index, line] of lines.entries()) {
    if (definedAt === null && /^run_optional_step\(\)\s*\{/.test(line)) definedAt = index + 1;
    if (firstUseAt === null && /^run_optional_step\s+"/.test(line)) firstUseAt = index + 1;
  }
  assert.ok(definedAt !== null, "run_optional_step の定義が見つからない");
  assert.ok(firstUseAt !== null, "run_optional_step の呼び出しが見つからない");
  assert.ok(
    definedAt! < firstUseAt!,
    `run_optional_step を定義（${definedAt}行）より前（${firstUseAt}行）で呼んでいます。`
    + "実行時に command not found になります",
  );
}

function testDataCollectionRunsBeforeTheCriticalStep(): void {
  // `run-daily.sh` は critical（失敗で停止）。その後ろに置くと、
  // レポート生成が壊れているあいだデータ収集まで止まる。
  // **レポートは翌日でも作り直せるが、TDnet は約28日で遡れなくなる。**
  const source = readFileSync(resolve(process.cwd(), SCRIPT), "utf-8");
  const criticalAt = source.indexOf('bash "$DIR/scripts/run-daily.sh"');
  assert.ok(criticalAt > 0, "critical な run-daily.sh の呼び出しが見つからない");

  for (const name of ["ingest-prices-catch-up", "archive-edinet-catch-up", "archive-tdnet-catch-up"]) {
    const at = source.indexOf(`run_optional_step "${name}"`);
    assert.ok(at > 0, `${name} が見つからない`);
    assert.ok(
      at < criticalAt,
      `${name} が critical な run-daily.sh より後ろにあります。`
      + "レポートが壊れている日にデータ収集まで止まります",
    );
  }
}

function testStepNamesAreUnique(): void {
  // 同じ名前が2つあると、失敗一覧を見てもどちらが落ちたか分からない。
  const steps = parseOptionalSteps(readFileSync(resolve(process.cwd(), SCRIPT), "utf-8"));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const step of steps) {
    if (seen.has(step.name)) duplicates.push(step.name);
    seen.add(step.name);
  }
  assert.deepEqual(duplicates, [], `名前が重複しています: ${duplicates.join(", ")}`);
}

function testLineContinuationIsFollowed(): void {
  // 行継続をつながずに解析すると、複数行に分けたステップの参照を取りこぼす。
  const parsed = parseOptionalSteps([
    'run_optional_step "a" \\',
    '  node --import "tsx/esm" \\',
    '  "$DIR/src/example.ts"',
  ].join("\n"));
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0]!.referencedPaths, ["src/example.ts"]);
}

function testHeredocStepsAreParsedWithoutPaths(): void {
  // ヒアドキュメントで書いたステップは $DIR 参照を持たない。
  // 取りこぼしではなく「参照が無い」ことを確かめる。
  const parsed = parseOptionalSteps([
    `run_optional_step "inline" node --import "tsx/esm" --input-type=module - <<'NODE'`,
    'console.log("x");',
    "NODE",
  ].join("\n"));
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0]!.referencedPaths, []);
}

testEveryReferencedFileExists();
testHelperIsDefinedBeforeFirstUse();
testDataCollectionRunsBeforeTheCriticalStep();
testStepNamesAreUnique();
testLineContinuationIsFollowed();
testHeredocStepsAreParsedWithoutPaths();

console.log("daily-optional-step-targets: 全テスト成功");
