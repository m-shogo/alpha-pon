// TDnet候補自動追加: TDnet公式閲覧サービス → watchlist.yml
// package.json の sync:tdnet / sync:tdnet:dry は dry-run 固定。
// このファイルを直接 --dry-run なしで実行した場合だけ addCandidates が書き込み可能。

import { fetchTdnetDisclosureSnapshot } from "./fetcher/jpx.js";
import { appendDisclosureSnapshot } from "./disclosure-archive.js";
import { STRUCTURAL_KEYWORDS } from "./fetcher/edinet.js";
import { addCandidates, loadWatchlistRaw } from "./watchlist-writer.js";
import type { Candidate } from "./types.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`\nTDnet構造イベントスキャン${dryRun ? " (dry-run)" : ""}\n`);
  console.log(`検索キーワード: ${STRUCTURAL_KEYWORDS.join(" / ")}\n`);

  let snapshot;
  try {
    snapshot = await fetchTdnetDisclosureSnapshot();
  } catch (err) {
    console.error(`TDnet公式閲覧サービス取得失敗: ${err instanceof Error ? err.message : err}`);
    console.log("TDnetの公開一覧またはHTML構造が変わった可能性があります。手動で確認してください。");
    if (dryRun) {
      console.log("dry-run のため、TDnet候補追加はスキップして後続pipelineへ進みます。");
      return;
    }
    process.exit(1);
  }

  // 取得したものは**まず保存する**。
  //
  // TDnet の公開閲覧サービスは約1ヶ月しか遡れない。ここで捨てると、
  // その日の開示は二度と取れない。不祥事・子会社イベントのラベルは
  // これが一次情報なので、貯め始めないと検証そのものが始まらない。
  //
  // 保存に失敗しても**止めない**。
  //
  // 当初は「取り戻せない損失だから止める」としたが、`daily:full` は
  // `&&` の連鎖なのでここで落とすと**朝のレポートが丸ごと出なくなる**。
  // しかも止めてしまうと、欠落を知らせるバナー（レポート冒頭に出る）自体が
  // 生成されない。黙って失うのを防ぐ仕組みを、失敗そのもので壊してしまう。
  //
  // 欠落は翌朝のレポートに「あと何日で取り戻せなくなるか」つきで出る。
  // 28日の猶予があるので、レポートが出るほうが気づける。
  try {
    const archived = appendDisclosureSnapshot({
      snapshot,
      retrievedAt: new Date().toISOString(),
    });
    console.log(
      `保存: ${archived.observationDate} → 新規 ${archived.appended}件`
      + `${archived.alreadyPresent > 0 ? ` / 保存済み ${archived.alreadyPresent}件` : ""}`,
    );
  } catch (error) {
    console.error(
      `[disclosure-archive] 保存に失敗: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(
      "[disclosure-archive] TDnet は約28日で遡れなくなる。"
      + "朝のレポートに欠落として出るので、期限内に pnpm archive:tdnet で埋めること",
    );
  }

  const disclosures = snapshot.disclosures;
  if (disclosures.length === 0) {
    if (!snapshot.explicitEmpty) {
      throw new Error("TDnet snapshot returned zero rows without explicit-empty proof");
    }
    console.log(`TDnet開示なし: ${snapshot.observationDate} は公式一覧で0件と明示されています。`);
    return;
  }

  console.log(`開示取得: ${disclosures.length}件 (${snapshot.pageCount}ページ)\n`);

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
    console.log(`    公開日時: ${d.publishedAt}`);
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
