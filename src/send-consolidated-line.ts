// LINE統合通知の実行時 CLI ラッパ。
//
// LINE_BATCH_DIR に蓄積された各ステップの通知断片を1通へ統合し送信する。
// 中核ロジックは line-consolidation.ts（純関数 + トランスポート抽象）に分離済み。
//
// 契約:
//  - 実送信は Transport 抽象に隔離。LINE_DRY_RUN=1 / NOTIFY_MODE=off / 資格情報なし
//    の場合は実 LINE API を呼ばず、本文を標準出力に出すのみ。
//  - 送信失敗は throw せず「非致命的な結果」として扱い、daily pipeline を止めない
//    （プロセスは常に exit 0。構造化結果を秘匿値なしで出力する）。
//  - トークン / userId 等の秘匿値をログ・エラーへ出さない。

import { existsSync, readdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import {
  buildConsolidatedMessage,
  createTransport,
  redactSecrets,
} from "./line-consolidation.js";

type RunResult = {
  status: "sent" | "dry-run" | "skipped" | "failed";
  reason?: string;
  sections?: number;
  chars?: number;
  droppedDuplicates?: number;
  omittedSections?: number;
  truncated?: boolean;
};

function logResult(result: RunResult): void {
  const safe = redactSecrets(JSON.stringify(result), [
    process.env.LINE_CHANNEL_TOKEN,
    process.env.LINE_USER_ID,
  ]);
  console.log(`line:consolidated result ${safe}`);
}

async function main(): Promise<RunResult> {
  const dir = process.env.LINE_BATCH_DIR;
  if (!dir || !existsSync(dir)) {
    return { status: "skipped", reason: "LINE_BATCH_DIR未設定またはディレクトリなし" };
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  if (files.length === 0) {
    return { status: "skipped", reason: "バッチファイルなし" };
  }

  const rawTexts = files.map((f) => readFileSync(join(dir, f), "utf-8"));

  // 即時送信済みの緊急件数（notify.ts が recordImmediateUrgent で書いたサイドカー）。
  const countFile = join(dir, "immediate-urgent.count");
  const immediateUrgentCount = existsSync(countFile)
    ? Number(readFileSync(countFile, "utf-8")) || 0
    : 0;

  const built = buildConsolidatedMessage(rawTexts, {
    today: todayJst(),
    immediateUrgentCount: Number.isFinite(immediateUrgentCount) ? immediateUrgentCount : 0,
  });

  if (built.message === null) {
    return { status: "skipped", reason: "通知対象セクションなし" };
  }

  const transport = createTransport();
  const sendResult = await transport.send(built.message);

  const base = {
    sections: built.sections.length,
    chars: built.message.length,
    droppedDuplicates: built.droppedDuplicateCount,
    omittedSections: built.omittedSectionCount,
    truncated: built.truncated,
  };

  if (transport.mode === "dry-run") {
    // ドライラン時は本文を確認できるよう出力（秘匿値は本文に含まれない）。
    console.log("LINE統合通知（ドライラン。実送信なし）:");
    console.log(built.message);
    return { status: "dry-run", ...base };
  }

  if (!sendResult.ok) {
    // 送信失敗は非致命的。バッチは消さず（次回再送・調査可能に）、結果だけ残す。
    return {
      status: "failed",
      reason: redactSecrets(sendResult.error, [
        process.env.LINE_CHANNEL_TOKEN,
        process.env.LINE_USER_ID,
      ]),
      ...base,
    };
  }

  // 送信成功時のみバッチを片付ける（idempotency: 再実行しても二重送信しない）。
  rmSync(dir, { recursive: true, force: true });
  return { status: "sent", ...base };
}

main()
  .then((result) => {
    logResult(result);
    // 送信失敗を含め、pipeline を止めないため常に exit 0。
    process.exit(0);
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    logResult({
      status: "failed",
      reason: redactSecrets(message, [
        process.env.LINE_CHANNEL_TOKEN,
        process.env.LINE_USER_ID,
      ]),
    });
    process.exit(0);
  });
