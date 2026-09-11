import { existsSync, lstatSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * 価格ディレクトリに同居する **付帯台帳** の名前は `_` で始める。
 *
 * なぜ名前で決めるか:
 *   付帯台帳は価格ファイルと同じ `.jsonl` で同じディレクトリに置かれるので、
 *   **名前でしか区別できない。** 実在するのは
 *   `_adjustments.jsonl`（権利落ち）と `_ingest-log.jsonl`（取り込み記録）。
 *
 * 区別しないと何が起きるか（実測）:
 *   2026-09-11 に全件検査を回したところ、この2本の 1,045 行が
 *   価格レコードとして読み込まれ、`firstExecutableAt` が無いために
 *   突き合わせが例外で停止した。**1件の異常で残り 215万行が未報告になる。**
 */
export function isPriceStoreSidecarName(name: string): boolean {
  return basename(name).startsWith("_");
}

/**
 * 価格データの `.jsonl` を列挙する。付帯台帳は含めない。
 *
 * symlink / hard link の拒否は付帯台帳にも適用する。
 * 出所の境界は、読む対象かどうかとは別の話。
 */
export function listPriceJsonlFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink()) {
    throw new Error(`price_store_symlink_not_allowed: ${root}`);
  }
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`price_store_symlink_not_allowed: ${path}`);
    }
    if (stat.isDirectory()) files.push(...listPriceJsonlFiles(path));
    else if (stat.isFile() && path.endsWith(".jsonl")) {
      if (stat.nlink !== 1) {
        throw new Error(`price_store_hardlink_not_allowed: ${path}`);
      }
      if (!isPriceStoreSidecarName(entry)) files.push(path);
    }
  }
  return files.sort();
}
