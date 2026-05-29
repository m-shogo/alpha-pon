// TDnet候補自動追加: JPX適時開示ページ → watchlist.yml
// pnpm sync:tdnet           # 実際に追加
// pnpm sync:tdnet --dry-run # プレビューのみ

import { fetchTdnetDisclosures } from "./fetcher/jpx.js";
import { STRUCTURAL_KEYWORDS } from "./fetcher/edinet.js";
import { addCandidates, loadWatchlistRaw } from "./watchlist-writer.js";
import type { Candidate } from "./types.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`\nTDnet構造イベントスキャン${dryRun ? " (dry-run)" : ""}\n`);
  console.log(`検索キーワード: ${STRUCTURAL_KEYWORDS.join(" / ")}\n`);

  let disclosures;
  try {
    disclosures = await fetchTdnetDisclosures();
  } catch (err) {
    console.error(`JPX適時開示取得失敗: ${err instanceof Error ? err.message : err}`);
    console.log("JPXページの構造が変わった可能性があります。手動で確認してください。");
    process.exit(1);
  }

  if (disclosures.length === 0) {
    console.log("開示情報が取得できませんでした (JPXページがJS描画の可能性があります)");
    console.log("代替: pnpm scan:edinet で EDINET 経由のスキャンを試してください");
    return;
  }

  console.log(`開示取得: ${disclosures.length}件\n`);

  // 構造イベントキーワードでフィルタ
  const structural = disclosures.filter(d =>
    STRUCTURAL_KEYWORDS.some(kw => d.title.includes(kw))
  );

  if (structural.length === 0) {
    console.log("構造イベント検出なし");
    return;
  }

  console.log(`構造イベント検出: ${structural.length}件\n`);

  // watchlistに既存のコードを除外
  const config = loadWatchlistRaw();
  const existingCodes = new Set(config.symbols.map(s => s.code));

  const novel = structural.filter(d => !existingCodes.has(d.code));

  if (novel.length === 0) {
    console.log("新規候補なし (すべて既存watchlistに存在)");
    return;
  }

  console.log("新規構造イベント候補:\n");
  for (const d of novel) {
    const matchedKws = STRUCTURAL_KEYWORDS.filter(kw => d.title.includes(kw));
    console.log(`  ${d.code} ${d.companyName}`);
    console.log(`    タイトル: ${d.title}`);
    console.log(`    キーワード: ${matchedKws.join(", ")}`);
    console.log(`    日時: ${d.publishedAt}`);
    console.log();
  }

  const newEntries: Candidate[] = novel.map(d => ({
    code: d.code,
    name: d.companyName,
    market: "TSE" as const,
    status: "candidate" as const,
    priority: "B" as const,
    tags: ["structural_event"],
    rules: ["structural_event"],
  }));

  const { added, skipped } = addCandidates(newEntries, dryRun);

  if (skipped.length > 0) {
    console.log(`スキップ (既存): ${skipped.map(s => s.code).join(", ")}`);
  }

  if (added.length > 0) {
    const action = dryRun ? "[dry-run] 追加予定" : "追加完了";
    console.log(`${action}: ${added.length}件`);
    if (!dryRun) {
      console.log("\nconfig/watchlist.yml を更新しました");
      console.log("優先度・タグは必要に応じて手動で編集してください");
    }
  }
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
