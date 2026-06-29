// 特殊状況 Morning Lite。子会社上場・スピンオフ・PE出口・ロックアップ解除などを短く通知する。

import { existsSync, readFileSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { sendPipelineSummaryNotification } from "./notify.js";

type Candidate = {
  code: string;
  name: string;
  patterns?: string[];
  chanceLevel?: "none" | "watch" | "attention" | "high";
  reasonSummary?: string;
  waitFor?: string[];
  listingInfo?: { confidence?: string; lockupExpiryAt?: string | null; firstEarningsAt?: string | null };
};

type Config = { candidates?: Candidate[] };

const PATTERN_LABELS: Record<string, string> = {
  carve_out_ipo: "子会社上場/カーブアウト",
  spin_off: "スピンオフ",
  pe_exit_ipo: "PE出口",
  post_ipo_lockup_overhang: "ロックアップ",
  parent_subsidiary_reorg: "親子上場解消",
  major_holder_exit_overhang: "大株主出口",
};

const LEVEL_ORDER = { high: 0, attention: 1, watch: 2, none: 3 } as const;

function labels(patterns: string[] = []): string[] {
  return patterns.map(pattern => PATTERN_LABELS[pattern]).filter(Boolean);
}

function nextCheck(c: Candidate): string {
  if (c.listingInfo?.lockupExpiryAt) return `ロックアップ解除日 ${c.listingInfo.lockupExpiryAt} の需給`;
  if (c.listingInfo?.firstEarningsAt) return `決算日 ${c.listingInfo.firstEarningsAt} の粗利率/需給`;
  return c.waitFor?.[0] ?? "公式IR・大株主持分・売出し有無";
}

async function main(): Promise<void> {
  const path = "config/special-situation-watch-rules.yml";
  if (!existsSync(path)) {
    console.log("特殊状況設定なし");
    return;
  }

  const config = load(readFileSync(path, "utf-8")) as Config;
  const items = (config.candidates ?? [])
    .map(c => ({ candidate: c, labels: labels(c.patterns) }))
    .filter(item => item.labels.length > 0)
    .sort((a, b) => LEVEL_ORDER[a.candidate.chanceLevel ?? "none"] - LEVEL_ORDER[b.candidate.chanceLevel ?? "none"])
    .slice(0, 5);

  if (items.length === 0) {
    console.log("特殊状況通知対象なし");
    return;
  }

  const today = todayJst();
  const text = [
    `💎 Alpha Pon 特殊状況 Lite ${today}`,
    "子会社上場・スピンオフ・PE出口・ロックアップを優先確認",
    "",
    ...items.flatMap(({ candidate, labels }) => [
      `・${candidate.code} ${candidate.name} [${candidate.chanceLevel ?? "watch"}]`,
      `  型: ${labels.join(" / ")}`,
      `  区分: ${candidate.listingInfo?.confidence ?? "unknown"}`,
      `  なぜ重要: ${candidate.reasonSummary ?? "構造変化と需給イベントが重なる可能性"}`,
      `  次に確認: ${nextCheck(candidate)}`,
    ]),
    "",
    "※売買推奨ではありません。未確認情報は一次情報不足として扱います。",
  ].join("\n");

  console.log(text);
  await sendPipelineSummaryNotification(text);
}

main().catch(err => {
  console.error("special-situation-morning-lite failed:", err);
  process.exit(1);
});
