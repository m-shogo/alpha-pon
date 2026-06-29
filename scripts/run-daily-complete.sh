#!/bin/bash
# 完全版 daily ラッパー
# - critical: run-daily.sh が失敗したら即停止する（古いデータで続行しない）
# - noncritical: Pro補助レポート・ユニバーススキャン・Next.js JSON は失敗してもログに残す
# - design/ には出力しない（pnpm ui:data は --legacy-design なし）
#
# 利用ステップ:
#   0. backup-data.sh      ... noncritical / data/ を backups/YYYY-MM-DD/ に圧縮保存
#   1. run-daily.sh        ... critical / 失敗で停止
#   2. Pro補助レポート群   ... noncritical / 失敗を FAILED_COMPLETE_STEPS に記録
#   3. scan:universe       ... noncritical
#   4. candidate:hypothesis ... noncritical
#   5. review:hypotheses   ... noncritical
#   6. ui:data:base + ui:data:pro ... noncritical（Next.js JSON 生成 + Pro addon キー追記）
#   7. 履歴化・知識レビュー ... noncritical

set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

DOW="$(date '+%u')"   # 1=Mon ... 7=Sun
DOM="$(date '+%d')"   # 01..31
MONTH="$(date '+%m')" # 01..12

# ── ログローテーション（7日分を保持）───────────────────────────────────────
# launchd は StandardOutPath に追記するため、1週間分だけ残して truncate する。
rotate_log() {
  local log="$1"
  if [ -f "$log" ]; then
    local lines
    lines="$(wc -l < "$log")"
    if [ "$lines" -gt 5000 ]; then
      tail -n 5000 "$log" > "$log.tmp" && mv "$log.tmp" "$log"
    fi
  fi
}
rotate_log "$DIR/logs/daily.log"
rotate_log "$DIR/logs/daily-error.log"

# ── バックアップ（critical より前に実行）────────────────────────────────────
# 前日データを保全してから pipeline を開始する。失敗しても続行。
echo "---- [backup-data.sh] start ----"
if bash "$DIR/scripts/backup-data.sh"; then
  echo "---- [backup-data.sh] ok ----"
else
  echo "---- [backup-data.sh] failed (non-critical, continuing) ----"
fi

# ── critical ──────────────────────────────────────────────────────────────────
# run-daily.sh が失敗したら complete pipeline を停止する。
# 失敗日に古い/不完全な JSON を成功扱いで生成しないため。
echo "---- [run-daily.sh] start ----"
if ! bash "$DIR/scripts/run-daily.sh"; then
  echo "---- [run-daily.sh] FAILED. stopping complete pipeline. ----"
  exit 1
fi
echo "---- [run-daily.sh] ok ----"

# ── noncritical ヘルパー ──────────────────────────────────────────────────────
# run_optional_step <name> <command...>
# 失敗してもスクリプト全体は止まらないが、FAILED_COMPLETE_STEPS に記録する。
FAILED_COMPLETE_STEPS=""

run_optional_step() {
  local name="$1"
  shift

  echo ""
  echo "---- [$name] start ----"
  if "$@"; then
    echo "---- [$name] ok ----"
    return 0
  else
    local code=$?
    echo "---- [$name] failed($code) ----"
    FAILED_COMPLETE_STEPS="$FAILED_COMPLETE_STEPS $name($code)"
    return "$code"
  fi
}

# ── イベント3日前リマインド ─────────────────────────────────────────────────
# 総会・決算・継続会・ロックアップ解除など、日付がある重要イベントだけ通知する。
run_optional_step "event-3day-reminder" node --env-file="$DIR/.env" --input-type=module - <<'NODE'
import { readFileSync } from "fs";
import { load } from "js-yaml";

const token = process.env.LINE_CHANNEL_TOKEN;
const userId = process.env.LINE_USER_ID;
const today = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
};
const daysUntil = (date) => Math.round((new Date(`${date}T00:00:00+09:00`) - new Date(`${today}T00:00:00+09:00`)) / 86400000);
const inReminderWindow = (date) => date && date >= today && date <= addDays(today, 3);

const config = load(readFileSync("config/special-situation-watch-rules.yml", "utf-8"));
const labels = { plannedListingAt: "上場予定", lockupExpiryAt: "ロックアップ解除", firstEarningsAt: "決算" };
const items = [];
for (const c of config.candidates ?? []) {
  for (const [key, label] of Object.entries(labels)) {
    const date = c.listingInfo?.[key];
    if (inReminderWindow(date)) {
      items.push({ date, label, name: `${c.code} ${c.name}`, confidence: c.listingInfo?.confidence ?? "unknown" });
    }
  }
}
for (const ev of config.referenceEvents ?? []) {
  if (inReminderWindow(ev.plannedDate)) {
    items.push({ date: ev.plannedDate, label: ev.eventType, name: `${ev.companyName}: ${ev.eventName}`, confidence: ev.confidence ?? "unknown" });
  }
}
items.sort((a, b) => a.date.localeCompare(b.date));
if (items.length === 0) {
  console.log("3日前リマインド対象なし");
  process.exit(0);
}
const text = [
  `⏰ Alpha Pon 3日前リマインド ${today}`,
  "重要イベントだけ通知 / 売買推奨なし",
  "",
  ...items.flatMap(item => [
    `・${item.name}`,
    `  ${item.label}: ${item.date}（${daysUntil(item.date) === 0 ? "今日" : `あと${daysUntil(item.date)}日`}）[${item.confidence}]`,
    "  次に確認: 公式IR・TDnet・開示日程の更新",
  ]),
  "",
  "※事実・報道・噂を混ぜず、未確認は一次情報不足として扱います。",
].join("\n");
if (!token || !userId) {
  console.log("LINE未設定のため送信スキップ");
  console.log(text);
  process.exit(0);
}
const res = await fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
});
if (!res.ok) throw new Error(`LINE event reminder failed: ${res.status} ${await res.text()}`);
NODE

# ── 情報秘書 Lite 通知 ───────────────────────────────────────────────────────
run_optional_step "data-freshness-report" node --import "tsx/esm" "$DIR/src/data-freshness-report.ts"
run_optional_step "emergency-disclosure-watch" node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/emergency-disclosure-watch.ts"
run_optional_step "special-situation-morning" node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/special-situation-morning-lite.ts"
run_optional_step "theme-news-ai" node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/theme-news-morning-lite.ts" ai
run_optional_step "theme-news-semiconductor" node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/theme-news-morning-lite.ts" semiconductor
run_optional_step "theme-news-space" node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/theme-news-morning-lite.ts" space
run_optional_step "theme-news-game" node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/theme-news-morning-lite.ts" game
run_optional_step "morning-lite-improvement" node --import "tsx/esm" "$DIR/src/morning-lite-improvement.ts"
run_optional_step "notification-feedback-report" node --import "tsx/esm" "$DIR/src/notification-feedback.ts" report

# ── Pro補助レポート ────────────────────────────────────────────────────────────
run_optional_step "proposal-history"          node --import "tsx/esm" "$DIR/src/proposal-history-run.ts"
run_optional_step "persona-audit"             node --import "tsx/esm" "$DIR/src/persona-audit.ts"
run_optional_step "valuation-range"           node --import "tsx/esm" "$DIR/src/valuation-range.ts"
run_optional_step "primary-disclosure-sub"    node --import "tsx/esm" "$DIR/src/primary-disclosure-subtypes.ts"
run_optional_step "regime-scenario"           node --import "tsx/esm" "$DIR/src/regime-scenario-report.ts"
run_optional_step "pro-knowledge-refresh"     node --import "tsx/esm" "$DIR/src/pro-knowledge-refresh-report.ts"
run_optional_step "company-onboarding"        node --import "tsx/esm" "$DIR/src/company-onboarding-audit.ts"
run_optional_step "stock-pro-quality"         node --import "tsx/esm" "$DIR/src/stock-pro-quality-audit.ts"
run_optional_step "stock-pro-roadmap"         node --import "tsx/esm" "$DIR/src/stock-pro-improvement-roadmap.ts"
run_optional_step "stock-pro-committee"       node --import "tsx/esm" "$DIR/src/stock-pro-committee-report.ts"
run_optional_step "ipo-theme-watch"          node --import "tsx/esm" "$DIR/src/ipo-theme-watch-report.ts"
run_optional_step "stock-pro-agent"           node --import "tsx/esm" "$DIR/src/stock-pro-agent-report.ts"
run_optional_step "stock-pro-summary"         node --import "tsx/esm" "$DIR/src/stock-pro-summary.ts"
run_optional_step "company-hypothesis"        node --import "tsx/esm" "$DIR/src/company-hypothesis-report.ts"
run_optional_step "company-network"           node --import "tsx/esm" "$DIR/src/company-network-report.ts"
run_optional_step "company-coverage"          node --import "tsx/esm" "$DIR/src/company-coverage-audit.ts"
run_optional_step "regime-hypothesis-align"   node --import "tsx/esm" "$DIR/src/regime-hypothesis-alignment.ts"
run_optional_step "stale-hypothesis"          node --import "tsx/esm" "$DIR/src/stale-hypothesis-report.ts"
run_optional_step "pipeline-health-summary"   node --import "tsx/esm" "$DIR/src/pipeline-health-summary.ts"
run_optional_step "pipeline-health-alert"     node --import "tsx/esm" "$DIR/src/pipeline-health-alert.ts"
run_optional_step "strategic-advice"          node --import "tsx/esm" "$DIR/src/strategic-advice-report.ts"

# ── 履歴化 ───────────────────────────────────────────────────────────────────
run_optional_step "regime-history"            node --import "tsx/esm" "$DIR/src/regime-history.ts"
run_optional_step "source-health-history"     node --import "tsx/esm" "$DIR/src/source-health-history.ts"
run_optional_step "company-non-move-sync"     node --import "tsx/esm" "$DIR/src/company-non-move-sync.ts"

# ── 知識蓄積レビュー（週次/月次/年次）──────────────────────────────────────
if [ "$DOW" = "1" ]; then
  run_optional_step "knowledge-weekly"        node --import "tsx/esm" "$DIR/src/knowledge-review.ts" --weekly
fi
if [ "$DOM" = "01" ]; then
  run_optional_step "knowledge-monthly"       node --import "tsx/esm" "$DIR/src/knowledge-review.ts" --monthly
fi
if [ "$MONTH" = "01" ] && [ "$DOM" = "01" ]; then
  run_optional_step "knowledge-yearly"        node --import "tsx/esm" "$DIR/src/yearly-knowledge-review.ts"
fi

# ── ユニバーススキャン・仮説生成・検証 ──────────────────────────────────────
# J-Quants設定済み: 本番API / 未設定: エラー（mockを使うなら --mock を明示）
#
# scan:universe が失敗した場合、古い universe_candidates_latest.json を元に
# 新規仮説を作らないよう candidate:hypothesis をスキップする。
SCAN_UNIVERSE_OK=0

if run_optional_step "scan:universe" node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/scan-stock-universe.ts"; then
  SCAN_UNIVERSE_OK=1
fi

if [ "$SCAN_UNIVERSE_OK" = "1" ]; then
  run_optional_step "candidate:hypothesis" node --import "tsx/esm" "$DIR/src/stock-candidate-hypothesis.ts"
else
  echo ""
  echo "---- [candidate:hypothesis] skipped: scan:universe failed ----"
  FAILED_COMPLETE_STEPS="$FAILED_COMPLETE_STEPS candidate:hypothesis(skipped_scan_failed)"
fi

# review:hypotheses は既存仮説の期限レビューなので scan失敗時も実行する
# （stock-candidate-hypothesis.ts の generatedAt チェックにより、
#   仮に古いファイルでも hypothesis 側でエラー終了する）
run_optional_step "review:hypotheses"         node --env-file="$DIR/.env" --import "tsx/esm" "$DIR/src/review-hypothesis-outcomes.ts"

# ── pipeline_status に失敗情報を書く（ui:data の前に実行）──────────────────
# ui:data / report-ui-data.ts が pipeline_status_latest.json を読んで
# meta.warnings に反映するため、必ず ui:data より先に書く。
write_complete_wrapper_status() {
  local pipeline_status="$DIR/reports/pipeline_status_latest.json"
  if [ ! -f "$pipeline_status" ]; then
    return 0
  fi

  node -e "
    const fs = require('fs');
    try {
      const path = '$pipeline_status';
      const data = JSON.parse(fs.readFileSync(path, 'utf8'));
      data.completeWrapperFailedSteps = '$FAILED_COMPLETE_STEPS'.trim().split(' ').filter(Boolean);
      data.completeWrapperRunAt = new Date().toISOString();
      fs.writeFileSync(path, JSON.stringify(data, null, 2));
    } catch(e) { process.exit(0); }
  " 2>/dev/null || true
}

write_complete_wrapper_status

# ── Next.js JSON 更新（最終ステップ）───────────────────────────────────────
# 出力先: apps/web/public/generated/alpha-pon-data.json のみ（design/ には出力しない）
# この時点で pipeline_status_latest.json に completeWrapperFailedSteps が書かれているため、
# report-ui-data.ts が meta.warnings に失敗情報を反映できる。
# pnpm ui:data と同じく base → pro の順で実行する（pro は base の出力に
# legendProCommittee / buffettQuality などの addon キーを追記する）。
run_optional_step "ui:data:base"              node --import "tsx/esm" "$DIR/src/report-ui-data.ts"
run_optional_step "ui:data:pro"               node --import "tsx/esm" "$DIR/src/pro-ui-data-addon.ts"

# ui:data 自体が失敗した場合も pipeline_status に残す
write_complete_wrapper_status

# ── 失敗ステップのサマリー（echo のみ）──────────────────────────────────────
echo ""
if [ -n "$FAILED_COMPLETE_STEPS" ]; then
  echo "[complete-wrapper] WARNING: 以下のステップが失敗しました: $FAILED_COMPLETE_STEPS"
else
  echo "[complete-wrapper] All optional steps succeeded."
fi

echo ""
echo "complete daily wrapper finished"