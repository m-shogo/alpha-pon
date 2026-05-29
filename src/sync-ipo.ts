// IPO自動同期: JPX新規上場ページ → watchlist.yml
// pnpm sync:ipo           # 実際に追加
// pnpm sync:ipo --dry-run # プレビューのみ

import { fetchIpoList, calcDaysSinceListing } from "./fetcher/jpx.js";
import { addCandidates } from "./watchlist-writer.js";
import type { Candidate } from "./types.js";

// 上場から何日以内のIPOを対象にするか
const IPO_WINDOW_DAYS = 365;

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`\nIPO同期${dryRun ? " (dry-run)" : ""}\n`);

  let ipoList;
  try {
    ipoList = await fetchIpoList();
  } catch (err) {
    console.error(`JPX IPOリスト取得失敗: ${err instanceof Error ? err.message : err}`);
    console.log("JPXページの構造が変わった可能性があります。手動で確認してください。");
    process.exit(1);
  }

  if (ipoList.length === 0) {
    console.log("IPOリストが空です (JPXページの解析に失敗した可能性があります)");
    return;
  }

  console.log(`JPX IPO取得: ${ipoList.length}件\n`);

  // 直近IPOのみ対象にする
  const recentIpos = ipoList.filter(ipo => {
    const days = calcDaysSinceListing(ipo.listingDate);
    return days >= 0 && days <= IPO_WINDOW_DAYS;
  });

  console.log(`${IPO_WINDOW_DAYS}日以内のIPO: ${recentIpos.length}件\n`);

  if (recentIpos.length === 0) {
    console.log("追加対象なし");
    return;
  }

  const newEntries: Candidate[] = recentIpos.map(ipo => ({
    code: ipo.code,
    name: ipo.name,
    market: "TSE" as const,
    status: "candidate" as const,
    priority: "B" as const,
    tags: ["ipo"],
    rules: ["ipo_selling_pressure_done", "volume_cooling", "no_new_low"],
  }));

  const { added, skipped } = addCandidates(newEntries, dryRun);

  if (skipped.length > 0) {
    console.log(`既存 (スキップ): ${skipped.map(s => `${s.code} ${s.name}`).join(", ")}\n`);
  }

  if (added.length === 0) {
    console.log("新規追加なし (すべて既存)");
    return;
  }

  const action = dryRun ? "[dry-run] 追加予定" : "追加完了";
  console.log(`${action}: ${added.length}件`);
  for (const c of added) {
    console.log(`  + ${c.code} ${c.name} (${calcDaysSinceListing(
      recentIpos.find(i => i.code === c.code)?.listingDate ?? ""
    )}日経過)`);
  }

  if (!dryRun) {
    console.log("\nconfig/watchlist.yml を更新しました");
    console.log("優先度・タグは必要に応じて手動で編集してください");
  }
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
