import { execFileSync } from "child_process";
import type { ScoreResult, AlertLevel } from "./types.js";
import {
  recordTextNotification,
  shouldSendTextNotification,
  textNotificationCountToday,
} from "./notification-dedupe.js";
import {
  createTransport,
  detectSection,
  redactSecrets,
  type TransportResult,
} from "./line-consolidation.js";
import {
  contentHash,
  enqueueFragment,
  ensureEntry,
  loadLedger,
  markFailed,
  markSent,
  saveLedger,
} from "./line-batch-queue.js";

// -------------------------------------------------------
// LINE バッチモード（LINE_BATCH_DIR 設定時に有効）
// 各ステップが個別送信せず、pendingキューへ蓄積 → 最後に統合CLIが1通にまとめる。
// enqueue しただけでは delivered 扱いにしない（実送信成功時のみ記録）。
// -------------------------------------------------------

function batchDir(): string | undefined {
  return process.env.LINE_BATCH_DIR || undefined;
}

// 通常通知をpendingキューへ追加する（delivered記録はしない）。
function enqueueNormal(text: string): void {
  const dir = batchDir();
  if (!dir) return;
  enqueueFragment(dir, { text, kind: "normal" });
}

// 緊急の実送信成功をledgerに記録する（当日の「即時通知済み」件数の正本）。
function recordUrgentDelivered(text: string): void {
  const dir = batchDir();
  if (!dir) return;
  const now = new Date().toISOString();
  const hash = contentHash(text);
  const ledger = loadLedger(dir);
  ensureEntry(ledger, { hash, section: detectSection(text) ?? "🚨 緊急開示", kind: "urgent", now });
  markSent(ledger, [hash], now);
  saveLedger(dir, ledger);
}

// 緊急の送信失敗をpendingキューへ積む（次回実行が再送）。
function enqueueUrgentPending(text: string, error: string): void {
  const dir = batchDir();
  if (!dir) return;
  const now = new Date().toISOString();
  const hash = contentHash(text);
  enqueueFragment(dir, { text, kind: "urgent" });
  const ledger = loadLedger(dir);
  markFailed(ledger, [hash], error, now);
  saveLedger(dir, ledger);
}

// -------------------------------------------------------
// macOS ネイティブ通知
// -------------------------------------------------------

const SOUND_BY_LEVEL: Record<AlertLevel, string> = {
  urgent: "Funk",
  daily:  "Glass",
  log:    "",
  ignore: "",
};

const MORNING_LITE_ITEM_LIMIT = 5;
const DEFAULT_LITE_DAILY_LIMIT = 8;

function appleScriptString(value: string): string {
  return JSON.stringify(value);
}

function notifyMacOS(result: ScoreResult): void {
  const sound = SOUND_BY_LEVEL[result.alertLevel];
  const title = `【調査候補】${result.candidate.code} ${result.candidate.name}`;
  const subtitle = `スコア ${result.score}/100`;
  const body = result.reasons.slice(0, 2).join(" | ") + "\n※買い推奨ではありません";

  const soundClause = sound ? ` sound name ${appleScriptString(sound)}` : "";
  const script =
    `display notification ${appleScriptString(body)} ` +
    `with title ${appleScriptString(title)} ` +
    `subtitle ${appleScriptString(subtitle)}` +
    soundClause;

  try {
    execFileSync("osascript", ["-e", script], { stdio: "ignore", timeout: 5000 });
  } catch {
    // SSH経由など通知が使えない環境では無視
  }
}

function notifyMacOSText(title: string, body: string, sound = "Basso"): void {
  const script =
    `display notification ${appleScriptString(body)} ` +
    `with title ${appleScriptString(title)} ` +
    `sound name ${appleScriptString(sound)}`;

  try {
    execFileSync("osascript", ["-e", script], { stdio: "ignore", timeout: 5000 });
  } catch {
    // SSH経由など通知が使えない環境では無視
  }
}

// -------------------------------------------------------
// LINE Messaging API（transport抽象経由。成否は TransportResult で返す）
// -------------------------------------------------------

type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: object;
};

function buildLineFlexCard(result: ScoreResult): LineFlexMessage {
  const isUrgent = result.alertLevel === "urgent";
  const headerColor = isUrgent ? "#C0392B" : "#2980B9";
  const levelLabel = isUrgent ? "🚨 即通知" : "📋 朝まとめ";

  const reasonItems = result.reasons.slice(0, 4).map(r => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: "・", size: "sm", color: "#888888", flex: 0 },
      { type: "text", text: r, size: "sm", color: "#333333", wrap: true },
    ],
    margin: "xs",
  }));

  const negItems = result.negativeReasons.slice(0, 2).map(r => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: "⚠", size: "sm", color: "#E67E22", flex: 0 },
      { type: "text", text: r, size: "sm", color: "#666666", wrap: true },
    ],
    margin: "xs",
  }));

  const body: object[] = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "スコア", size: "sm", color: "#888888", flex: 1 },
        { type: "text", text: `${result.score} / 100`, size: "xl", weight: "bold", color: headerColor, align: "end" },
      ],
    },
    { type: "separator", margin: "md" },
    { type: "text", text: "検出理由", size: "xs", color: "#888888", margin: "md" },
    ...reasonItems,
  ];

  if (negItems.length > 0) {
    body.push({ type: "text", text: "注意点", size: "xs", color: "#888888", margin: "md" }, ...negItems);
  }

  body.push(
    { type: "separator", margin: "md" },
    { type: "text", text: "※買い推奨ではありません", size: "xxs", color: "#AAAAAA", margin: "sm" }
  );

  return {
    type: "flex",
    altText: `【調査候補】${result.candidate.code} ${result.candidate.name} スコア${result.score}点`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        contents: [
          { type: "text", text: levelLabel, color: "#FFFFFF", size: "xs", weight: "bold" },
          { type: "text", text: `${result.candidate.code} ${result.candidate.name}`, color: "#FFFFFF", size: "lg", weight: "bold", wrap: true },
        ],
      },
      body: { type: "box", layout: "vertical", contents: body },
    },
  };
}

function evidenceLabel(result: ScoreResult): string {
  const decision = result.primaryDisclosureReview?.decision;
  if (decision === "confirmed") return "事実/一次情報";
  if (decision === "caution") return "事実/注意情報";
  if (decision === "block") return "ブロック情報";
  return "一次情報不足";
}

function nextCheck(result: ScoreResult): string {
  return (
    result.nextSteps[0] ??
    result.expertReview?.requiredBeforeNotification[0] ??
    result.primaryDisclosureReview?.evidenceNeeded[0] ??
    result.negativeReasons[0] ??
    "一次情報と次イベント日程を確認"
  );
}

// 緊急の安定テキスト表現（hash/dedup/pending 再送に使う。表示はflexだが再送時はこのtext）。
function urgentText(result: ScoreResult): string {
  return [
    `🚨 ${result.candidate.code} ${result.candidate.name} ${result.score}点`,
    `  区分: ${evidenceLabel(result)}`,
    `  なぜ重要: ${result.reasons[0] ?? "重要変化の兆候を検出"}`,
    `  次に確認: ${nextCheck(result)}`,
  ].join("\n");
}

function buildLineSummaryText(
  results: ScoreResult[],
  date: string,
  options: { excludeUrgent?: boolean } = {},
): string {
  const urgent = results.filter(r => r.alertLevel === "urgent");
  const daily  = results.filter(r => r.alertLevel === "daily");
  // 緊急は即時通知済みのため、統合メッセージ側の一覧からは除外して重複を防ぐ。
  const allItems = options.excludeUrgent ? daily : [...urgent, ...daily];
  const visibleItems = allItems.slice(0, MORNING_LITE_ITEM_LIMIT);

  if (allItems.length === 0) {
    // バッチ（統合）モードで日次項目が無い場合は空文字を返し、
    // 「対象なし」の誤解を招く空通知を出さない（緊急があれば即時通知済み）。
    if (options.excludeUrgent) return "";
    return [
      `🌅 Alpha Pon Morning Lite ${date}`,
      "5分朝刊 / 重要な変化だけ",
      "━━━━━━━━━━━━",
      "✅ 通知対象なし",
      "",
      "※売買推奨ではありません。事実・報道・噂は混ぜず、未確認は一次情報不足として扱います。",
    ].join("\n");
  }

  const lines = [
    `🌅 Alpha Pon Morning Lite ${date}`,
    "5分朝刊 / 重要な変化だけ",
    "━━━━━━━━━━━━",
    `🚨 即通知候補: ${urgent.length}件`,
    `📌 朝確認: ${daily.length}件`,
    "",
    "🔥 今日見るもの",
    ...visibleItems.flatMap((r, index) => {
      const icon = r.alertLevel === "urgent" ? "🚨" : "📌";
      return [
        "",
        `${index + 1}. ${icon} ${r.candidate.code} ${r.candidate.name} ${r.score}点`,
        `   区分: ${evidenceLabel(r)}`,
        `   なぜ重要: ${r.reasons[0] ?? "重要変化の兆候を検出"}`,
        `   次に確認: ${nextCheck(r)}`,
      ];
    }),
  ];

  const hiddenCount = allItems.length - visibleItems.length;
  if (hiddenCount > 0) lines.push("", `ほか${hiddenCount}件はノイズ削減のため省略`);

  lines.push("", "━━━━━━━━━━━━", "※売買推奨ではありません。事実・報道・噂は混ぜず、未確認は一次情報不足として扱います。");
  return lines.join("\n");
}

// 統一transport経由の送信。成否を TransportResult で返す（void で握りつぶさない）。
async function deliver(messages: object[]): Promise<TransportResult> {
  return createTransport().send(messages);
}

function liteDailyLimit(): number {
  const raw = Number(process.env.MORNING_LITE_DAILY_LIMIT ?? DEFAULT_LITE_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LITE_DAILY_LIMIT;
}

function shouldSuppressByLiteLimit(text: string): boolean {
  const isLite = text.includes("Lite");
  const isEmergency = text.startsWith("🚨") || text.startsWith("⏰");
  return isLite && !isEmergency && textNotificationCountToday() >= liteDailyLimit();
}

// 通常テキスト通知。バッチモードは enqueue のみ（delivered記録は統合送信成功時）。
async function pushDedupedText(text: string): Promise<void> {
  if (!text) return;
  if (shouldSuppressByLiteLimit(text)) {
    console.log(`Lite通知上限スキップ: ${textNotificationCountToday()}/${liteDailyLimit()}件`);
    return;
  }
  // 本日すでに実送信済みの内容は再enqueue/再送しない（送信成功時のみ記録されている）。
  if (!shouldSendTextNotification(text)) {
    console.log("重複通知スキップ（本日送信済み）");
    return;
  }
  if (batchDir()) {
    enqueueNormal(text);
    return;
  }
  // 非バッチ: 直接送信し、成功時だけ dedupe 記録。
  const res = await deliver([{ type: "text", text }]);
  if (res.ok) {
    recordTextNotification(text);
  } else if (res.outcome !== "dry-run" && res.outcome !== "credentials-missing") {
    console.warn(`LINE通知失敗: ${redactSecrets(res.error ?? res.outcome, [process.env.LINE_CHANNEL_TOKEN, process.env.LINE_USER_ID])}`);
  }
}

// 緊急送信結果の後処理。実送信成功時だけ「即時通知済み」に数える。
function handleUrgentResult(text: string, res: TransportResult): void {
  if (res.ok) {
    recordUrgentDelivered(text);
    recordTextNotification(text);
    return;
  }
  if (res.outcome === "dry-run") {
    console.log("緊急通知（ドライラン。実送信なし・未達扱い）");
    return;
  }
  const reason = redactSecrets(res.error ?? res.outcome, [process.env.LINE_CHANNEL_TOKEN, process.env.LINE_USER_ID]);
  console.warn(`緊急通知未達（${res.outcome}）: ${reason} — pendingへ退避し次回再送`);
  enqueueUrgentPending(text, res.outcome === "credentials-missing" ? "credentials-missing" : (res.error ?? res.outcome));
}

// -------------------------------------------------------
// 公開API
// -------------------------------------------------------

// 緊急（alertLevel === "urgent"）だけが即時送信パス。
// 実送信成功時だけ delivered/即時通知済みに数える。失敗は pending へ退避して再送保証する。
export async function sendUrgentNotifications(results: ScoreResult[]): Promise<void> {
  for (const result of results) {
    notifyMacOS(result);
    console.log(`  macOS通知: ${result.candidate.code} ${result.candidate.name} ${result.score}点`);
    const res = await deliver([buildLineFlexCard(result)]);
    handleUrgentResult(urgentText(result), res);
  }
}

// TDnet重要開示のP0即時通知経路。朝刊バッチには回さない。
export async function sendUrgentDisclosure(text: string): Promise<void> {
  notifyMacOSText("🚨 緊急開示", text.slice(0, 200), "Basso");
  const res = await deliver([{ type: "text", text }]);
  handleUrgentResult(text, res);
}

export async function sendDailySummary(results: ScoreResult[], date: string): Promise<void> {
  const text = buildLineSummaryText(results, date, { excludeUrgent: Boolean(batchDir()) });
  if (!text) return;
  await pushDedupedText(text);
}

export async function sendPipelineFailureNotification(step: string, message: string): Promise<void> {
  const title = "🚨 alpha-pon 自動実行失敗";
  const body = `${step}\n${message.slice(0, 500)}`;
  notifyMacOSText(title, body, "Basso");
  // パイプライン失敗は即時アラート（バッチに畳まない）。成否は握りつぶさずログ。
  const res = await deliver([{ type: "text", text: `${title}\n\nstep: ${step}\n${message.slice(0, 1000)}` }]);
  if (!res.ok && res.outcome !== "dry-run" && res.outcome !== "credentials-missing") {
    console.warn(`失敗アラート未達（${res.outcome}）`);
  }
}

export async function sendPipelineSummaryNotification(text: string): Promise<void> {
  await pushDedupedText(text);
}

export async function fetchLineUserId(): Promise<string | null> {
  const token = process.env.LINE_CHANNEL_TOKEN;
  if (!token) {
    console.error("LINE_CHANNEL_TOKEN が未設定");
    return null;
  }
  const res = await fetch("https://api.line.me/v2/profile", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`LINE profile取得失敗: ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { userId: string; displayName: string };
  console.log(`LINE userId: ${data.userId}  (${data.displayName})`);
  return data.userId;
}
