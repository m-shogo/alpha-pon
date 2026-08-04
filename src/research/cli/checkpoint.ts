// Research OS — Checkpoint の保存と表示。
//
//   pnpm research:checkpoint --show
//   pnpm research:checkpoint --from=tmp/checkpoint.json
//
// --from に渡す JSON は sequence / savedAt を含めない（CLI が採番する）。
// 保存時は必ず history/ に immutable なスナップショットを残してから latest.json を更新する。

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { loadCheckpoint, loadSchema, paths, writeGeneratedJson, writeNewFile } from "../io.js";
import { formatErrors, validate } from "../schema.js";
import type { Checkpoint } from "../types.js";
import { fail, nowJstIso, parseArgs } from "./common.js";

function showCheckpoint(): void {
  const checkpoint = loadCheckpoint();
  if (!checkpoint) {
    console.log("Checkpoint はまだありません（初回の研究サイクルです）");
    return;
  }
  console.log(`sequence: ${checkpoint.sequence}`);
  console.log(`savedAt : ${checkpoint.savedAt} (${checkpoint.actor})`);
  console.log(`研究     : ${checkpoint.researchDone}`);
  if (checkpoint.researchedEdgeId) console.log(`対象Edge : ${checkpoint.researchedEdgeId}`);
  if (checkpoint.addedAnalogIds.length > 0) console.log(`追加Analog: ${checkpoint.addedAnalogIds.join(", ")}`);
  if (checkpoint.rejections.length > 0) {
    console.log("棄却:");
    for (const rejection of checkpoint.rejections) console.log(`  - ${rejection.target}: ${rejection.reason}`);
  }
  if (checkpoint.dataGaps.length > 0) console.log(`不足データ: ${checkpoint.dataGaps.join(" / ")}`);
  console.log("次回研究候補:");
  for (const candidate of checkpoint.nextCandidates) console.log(`  - ${candidate.edgeId}: ${candidate.why}`);
}

function saveCheckpoint(fromPath: string): void {
  if (!existsSync(fromPath)) fail(`ファイルがありません: ${fromPath}`);

  const previous = loadCheckpoint();
  const input = JSON.parse(readFileSync(fromPath, "utf-8")) as Record<string, unknown>;
  const savedAt = nowJstIso();

  const checkpoint = {
    schemaVersion: 1,
    ...input,
    sequence: (previous?.sequence ?? 0) + 1,
    savedAt,
  } as Checkpoint;

  const errors = validate(checkpoint, loadSchema("checkpoint"));
  if (errors.length > 0) fail(`Checkpoint がスキーマに適合しません:\n${formatErrors(errors)}`);

  // 履歴は immutable。同じ時刻で2回保存しようとしたらここで落ちる（意図的）。
  const historyName = `${savedAt.replace(/[:+]/g, "-")}-seq${checkpoint.sequence}.json`;
  writeNewFile(join(paths.checkpointHistory(), historyName), `${JSON.stringify(checkpoint, null, 2)}\n`);
  writeGeneratedJson(paths.checkpointLatest(), checkpoint);

  console.log(`✓ Checkpoint sequence=${checkpoint.sequence} を保存しました`);
  console.log(`  履歴: research/checkpoint/history/${historyName}`);
  console.log(`  次回研究候補: ${checkpoint.nextCandidates.map((candidate) => candidate.edgeId).join(", ")}`);
}

function main(): void {
  const { flags, options } = parseArgs();
  if (flags.has("show") || (!options.has("from") && flags.size === 0)) {
    showCheckpoint();
    return;
  }
  const from = options.get("from");
  if (!from) fail("--from=<checkpoint.json> または --show を指定してください");
  saveCheckpoint(from);
}

main();
