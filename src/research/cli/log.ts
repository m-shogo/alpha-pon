// Research OS — Research Log への追記（Append Only）。
//
//   pnpm research:log --from=tmp/log.json     JSON（1件 or 配列）を追記
//
// id 重複と未来日時はここで弾く。追記後のファイルは以後 1 文字も書き換えられない。

import { existsSync, readFileSync } from "fs";
import { appendJsonl, loadResearchLog, loadSchema, paths } from "../io.js";
import { formatErrors, validate } from "../schema.js";
import type { ResearchLogEntry } from "../types.js";
import { fail, nowJstIso, parseArgs } from "./common.js";

function yearMonthOf(isoDateTime: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date(isoDateTime))
    .slice(0, 7);
}

function main(): void {
  const { options } = parseArgs();
  const from = options.get("from");
  if (!from) fail("--from=<log.json> を指定してください（1件のオブジェクト、または配列）");
  if (!existsSync(from)) fail(`ファイルがありません: ${from}`);

  const parsed = JSON.parse(readFileSync(from, "utf-8")) as unknown;
  const inputs = Array.isArray(parsed) ? parsed : [parsed];
  const now = nowJstIso();
  const existingIds = new Set(loadResearchLog().map((entry) => entry.id));

  const entries: ResearchLogEntry[] = [];
  for (const [index, raw] of inputs.entries()) {
    const entry = { schemaVersion: 1, at: now, ...(raw as Record<string, unknown>) } as ResearchLogEntry;
    const errors = validate(entry, loadSchema("research-log"));
    if (errors.length > 0) fail(`${index + 1} 件目がスキーマに適合しません:\n${formatErrors(errors)}`);
    if (existingIds.has(entry.id)) fail(`id が既に存在します: ${entry.id}（Append Only のため再利用できません）`);
    if (entry.at > new Date().toISOString()) fail(`at が未来です: ${entry.at}`);
    existingIds.add(entry.id);
    entries.push(entry);
  }

  for (const entry of entries) {
    appendJsonl(paths.researchLogFile(yearMonthOf(entry.at)), entry);
  }
  console.log(`✓ Research Log に ${entries.length} 件追記しました`);
  for (const entry of entries) console.log(`  - ${entry.at} [${entry.type}] ${entry.summary}`);
}

main();
