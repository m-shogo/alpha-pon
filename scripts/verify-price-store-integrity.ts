// 取り込んだ価格ストアの健全性を検査する。
//
// このストアは F1・イベントスタディ・backtest すべての土台。静かに壊れると
// 先の測定が「動いているが間違っている」状態になり、候補件数では気づけない。
//
// 取り込みが1日も無い環境（CI）では「検査対象なし」で正常終了する。
// ここで落とすと CI が価格データを要求することになり、誰も回さなくなる。

import { auditPriceStore } from "../src/research/providers/jquants-daily-store-audit.js";

// 全期間を見る。既定は 40営業日の抽出だが、それだと 487営業日中 8% しか
// 見ずに「ok」と出る。実測（2026-09-11）で全期間 487営業日 / 2,149,545行でも
// 6.3秒 / heap 98MB なので、抽出する理由が無い。
const report = auditPriceStore({ sampleDates: 0 });

if (report.datesAudited === 0) {
  console.log("price-store-integrity: 取り込み済みの価格が無いので検査対象なし: ok");
  process.exit(0);
}

const stats = report.stats;
console.log(
  `検査 ${report.datesAudited}営業日 / ${report.rowsAudited.toLocaleString()}行`
  + `（全期間 ${stats.firstDate} 〜 ${stats.lastDate}）`,
);
console.log(
  `  1日の行数   最小 ${stats.minRowsPerDay} / 中央 ${stats.medianRowsPerDay} / 最大 ${stats.maxRowsPerDay}`,
);
console.log(
  `  板が立った率 ${(stats.minTradedRatio * 100).toFixed(1)}% 〜 ${(stats.maxTradedRatio * 100).toFixed(1)}%`,
);
console.log(`  権利落ち     ${stats.adjustmentEvents}件`);

const errors = report.findings.filter((finding) => finding.severity === "error");
const warnings = report.findings.filter((finding) => finding.severity === "warning");

for (const warning of warnings.slice(0, 10)) {
  console.log(`  警告 ${warning.code}: ${warning.message}`);
}
if (warnings.length > 10) console.log(`  警告 ほか ${warnings.length - 10}件`);

if (errors.length > 0) {
  console.error(`price-store-integrity: ${errors.length}件の異常`);
  for (const error of errors.slice(0, 20)) {
    console.error(`  ${error.code}: ${error.message}`);
  }
  if (errors.length > 20) console.error(`  ほか ${errors.length - 20}件`);
  process.exit(1);
}

console.log("price-store-integrity: ok");
