// catchup: 過去日をどう扱うかの判断。
//
// scripts/run-catchup.ts から切り出した純関数。
// 元はスクリプト内にインライン展開されており、テストがソーステキストへの
// 正規表現 assertion しかできなかった。その正規表現は `[\s\S]*` で
// defer ガードごと飲み込むため、守りたい性質を原理的に検出できていなかった。

export type CatchupPastDateAction =
  /** 今日の実行が失敗したので、過去日は未解決のまま残して次回再評価する */
  | "defer"
  /** 今日の実行が過去分を集約したので、過去日は skipped にしてよい */
  | "skip"
  /** backfill できないジョブなので missing_jobs に記録する */
  | "missing";

export function decideCatchupPastDateAction(input: {
  canBackfill: boolean;
  todayCovered: boolean;
}): CatchupPastDateAction {
  if (!input.canBackfill) return "missing";
  // 今日の実行が過去分を集約する設計なので、今日が失敗したまま
  // 過去日を skipped にすると、取りこぼしが解消済みに見えてしまう。
  if (!input.todayCovered) return "defer";
  return "skip";
}
