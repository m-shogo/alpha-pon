// LINE統合通知 + 永続キュー(ledger)のテスト。
// 実ネットワークには一切接続しない（DryRun / 注入fetchモック / tempディレクトリfixtureのみ）。
// pnpm test で自動実行される。
//
// ChatGPTレビュー Blocking 1/2/3 + determinism + 必須テスト1〜21 を網羅する。

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildConsolidatedMessage,
  dedupeFragments,
  normalizeKey,
  detectSection,
  redactSecrets,
  createTransport,
  DryRunTransport,
  MissingCredentialsTransport,
  LineApiTransport,
  LINE_MAX_CHARS,
  SECTION_ORDER,
  type BatchFragment,
} from "../src/line-consolidation.js";
import {
  contentHash,
  emptyLedger,
  ensureEntry,
  markSent,
  markFailed,
  markSkipped,
  pendingHashes,
  isDelivered,
  countUrgentDeliveredToday,
  pruneLedger,
  MAX_ATTEMPTS,
  enqueueFragment,
  loadLedger,
  loadPendingFragments,
  reconcileOrphanFragments,
  saveLedger,
} from "../src/line-batch-queue.js";

const TODAY = "2026-08-05";
const NOW = "2026-08-05T00:00:00.000Z";

// hash 付き fragment を作るヘルパ（本文ベースで安定 hash）。
function frag(raw: string): BatchFragment {
  const { section, body } = { section: detectSection(raw) ?? "📋 その他", body: strip(raw) };
  return { hash: contentHash(raw), section, body };
}
function strip(raw: string): string {
  // parseFragmentText 相当（テスト内簡易版：先頭ヘッダ行を落とす）
  const lines = raw.split("\n");
  return lines.slice(1).filter(l => l.trim() && !l.includes("━") && !l.startsWith("※")).join("\n").trim();
}

function morningLite(body: string): string {
  return `🌅 Alpha Pon Morning Lite 2026-08-05\n${body}`;
}
function special(body: string): string {
  return `💎 Alpha Pon 特殊状況 Lite 2026-08-05\n${body}`;
}
function aiNews(body: string): string {
  return `🤖 AIニュース 2026-08-05\n${body}`;
}

// =========================================================================
// A. 統合メッセージ builder（決定論・重複排除・上限）
// =========================================================================

// --- 0件 -------------------------------------------------------------------
{
  const r = buildConsolidatedMessage([], { today: TODAY });
  assert.equal(r.message, null, "0件はメッセージ null（空通知を送らない）");
  assert.equal(r.includedCount, 0);
}

// --- 通常1件 ---------------------------------------------------------------
{
  const r = buildConsolidatedMessage([frag(morningLite("1. 📌 7203 トヨタ 62点"))], { today: TODAY });
  assert.ok(r.message);
  assert.ok(r.message!.includes("🌅 Alpha Pon 朝刊 2026-08-05"));
  assert.ok(r.message!.includes("■ 📊 銘柄スコア"));
  assert.ok(r.message!.includes("7203 トヨタ"));
  assert.equal(r.includedCount, 1);
  assert.equal(r.omittedItemCount, 0);
}

// --- (15) 同一セクションに複数項目、入力順非依存 ---------------------------
{
  const a = frag(morningLite("1. 📌 111 AAA 50点"));
  const b = frag(morningLite("2. 📌 999 ZZZ 70点"));
  const forward = buildConsolidatedMessage([a, b], { today: TODAY }).message;
  const reversed = buildConsolidatedMessage([b, a], { today: TODAY }).message;
  assert.equal(forward, reversed, "同一section複数項目でも入力順非依存で同一本文");
}

// --- (16) duplicate variant（URL/空白違い）順序反転で同一本文・同一代表 ----
{
  const v1 = frag(special("・XYZ 監視 https://a.example/1"));
  const v2 = frag(special("・XYZ  監視  https://b.example/2"));
  assert.equal(
    normalizeKey("💎 特殊状況", strip(special("・XYZ 監視 https://a.example/1"))),
    normalizeKey("💎 特殊状況", strip(special("・XYZ  監視  https://b.example/2"))),
    "URL/空白違いは同一論理キー",
  );
  const forward = buildConsolidatedMessage([v1, v2], { today: TODAY });
  const reversed = buildConsolidatedMessage([v2, v1], { today: TODAY });
  assert.equal(forward.message, reversed.message, "variant順序反転でも同一本文");
  assert.equal(forward.includedCount, 1, "重複は1件だけ採用");
  assert.equal(forward.droppedDuplicateCount, 1);
  // 代表選択は hash 最小で決定論的
  const dd = dedupeFragments([v1, v2]);
  const repHash = dd.representatives[0].hash;
  const expected = [v1.hash, v2.hash].sort()[0];
  assert.equal(repHash, expected, "代表は hash 最小で一意");
}

// --- 決定論的セクション順（テーマは末尾に畳む）-----------------------------
{
  const r = buildConsolidatedMessage(
    [frag(aiNews("・AIチップ")), frag(special("・S1")), frag(morningLite("1. 📌 1 X 50点")), frag("🔧 半導体ニュース\n・装置")],
    { today: TODAY },
  );
  const iScore = r.message!.indexOf("■ 📊 銘柄スコア");
  const iSpecial = r.message!.indexOf("■ 💎 特殊状況");
  const iTheme = r.message!.indexOf("■ 📰 テーマニュース");
  assert.ok(iScore >= 0 && iSpecial > iScore && iTheme > iSpecial, "決定論的順序");
  assert.ok(r.message!.includes("🤖 AI") && r.message!.includes("🔧 半導体"));
}

// --- (17)(18) 文字数超過: 省略fragmentはincludedにならない・件数明記 -------
{
  const bulk = "行".repeat(300);
  const r = buildConsolidatedMessage(
    [frag(morningLite(bulk)), frag(special(bulk)), frag(aiNews(bulk))],
    { today: TODAY, maxChars: 900 },
  );
  assert.ok(r.message!.length <= 900);
  assert.ok(r.message!.includes("■ 📊 銘柄スコア"), "最優先セクションは残る");
  assert.ok(r.omittedItemCount >= 1, "省略件数>0");
  assert.ok(r.message!.includes(`ほか ${r.omittedItemCount} 件`), "本文に省略件数を明記");
  // (17) omitted と included は交わらない（省略をdelivered扱いしない）
  const inc = new Set(r.includedHashes);
  for (const h of r.omittedHashes) assert.ok(!inc.has(h), "省略fragmentはincludedに入らない");
  // includedCount は実際に含まれた件数
  assert.equal(r.includedCount, r.includedHashes.length);
  assert.ok(r.includedCount < 3, "全件は入っていない");
}

// --- 巨大単一fragment: 空にならず切り詰め＋続き案内 -------------------------
{
  const r = buildConsolidatedMessage([frag(morningLite("あ".repeat(20000)))], { today: TODAY, maxChars: 500 });
  assert.ok(r.message && r.message.length <= 500);
  assert.equal(r.truncated, true);
  assert.ok(r.message!.includes("🌅 Alpha Pon 朝刊"), "ヘッダ保持");
}

// --- デフォルト上限でも壊れない -------------------------------------------
{
  const items = Array.from({ length: 60 }, (_, i) => frag(special(`・銘柄${i} 特殊状況の詳細説明テキスト`)));
  const r = buildConsolidatedMessage(items, { today: TODAY });
  assert.ok(r.message!.length <= LINE_MAX_CHARS);
}

// --- urgent参照（即時通知済み）-------------------------------------------
{
  const r = buildConsolidatedMessage([], { today: TODAY, immediateUrgentCount: 2 });
  assert.ok(r.message!.includes("🚨 緊急 2 件は即時通知済み"));
  const r0 = buildConsolidatedMessage([frag(morningLite("1. 📌 1 X 50点"))], { today: TODAY, immediateUrgentCount: 0 });
  assert.ok(!r0.message!.includes("即時通知済み"));
}

// =========================================================================
// B. リダクション / トランスポート
// =========================================================================

// --- (19) 秘匿値リダクション ----------------------------------------------
{
  const token = "abcd1234TOKENsecretVALUE";
  const userId = "Uxxxxxxxxxxxxxxxxx";
  const red = redactSecrets(`Bearer ${token} to=${userId}`, [token, userId, undefined, ""]);
  assert.ok(!red.includes(token) && !red.includes(userId) && red.includes("***REDACTED***"));
}

// --- (21) 資格情報なし/NOTIFY_MODE=off → 実送信しない ----------------------
{
  assert.ok(createTransport({} as NodeJS.ProcessEnv) instanceof MissingCredentialsTransport);
  assert.equal(createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y", NOTIFY_MODE: "off" } as any).mode, "dry-run");
  assert.ok(createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y", LINE_DRY_RUN: "1" } as any) instanceof DryRunTransport);
  assert.equal(createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y" } as any).mode, "real");
}

// --- DryRun: 実送信せず ok=false(dry-run) ----------------------------------
{
  const t = new DryRunTransport();
  const res = await t.send([{ type: "text", text: "hi" }]);
  assert.deepEqual(res, { ok: false, outcome: "dry-run" });
  assert.equal(t.sent.length, 1);
}

// --- credentials-missing ---------------------------------------------------
{
  const res = await new MissingCredentialsTransport().send([]);
  assert.equal(res.ok, false);
  assert.equal(res.outcome, "credentials-missing");
}

// --- (11) HTTP 4xx / 5xx を区別、throwしない、userId伏字 --------------------
{
  const f4 = (async () => ({ ok: false, status: 429, text: async () => "rate limited Uuser" }) as any) as typeof fetch;
  const r4 = await new LineApiTransport("tok", "Uuser", f4).send([]);
  assert.equal(r4.outcome, "http-4xx");
  assert.equal(r4.status, 429);
  assert.ok(!(r4.error ?? "").includes("Uuser"), "応答本文のuserIdも伏字");

  const f5 = (async () => ({ ok: false, status: 503, text: async () => "oops" }) as any) as typeof fetch;
  const r5 = await new LineApiTransport("tok", "Uuser", f5).send([]);
  assert.equal(r5.outcome, "http-5xx");
}

// --- (12)(20) network error: throwせず結果で返す（pipeline継続可能）--------
{
  const throwing = (async () => { throw new Error("down secretTOK123"); }) as unknown as typeof fetch;
  const res = await new LineApiTransport("secretTOK123", "U", throwing).send([]);
  assert.equal(res.ok, false);
  assert.equal(res.outcome, "network-error");
  assert.ok(!(res.error ?? "").includes("secretTOK123"), "network errorにトークンを出さない");
}

// --- 成功 ------------------------------------------------------------------
{
  let url = "";
  const okFetch = (async (u: any) => { url = String(u); return { ok: true, status: 200, text: async () => "" } as any; }) as typeof fetch;
  const res = await new LineApiTransport("tok", "U", okFetch).send([{ type: "text", text: "m" }]);
  assert.deepEqual(res, { ok: true, outcome: "sent", status: 200 });
  assert.ok(url.includes("api.line.me"));
}

// =========================================================================
// C. Ledger 純関数（配信状態遷移）
// =========================================================================

// --- (1) enqueue相当（ensureEntry）は queued であり delivered ではない ------
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "h1", section: "📊 銘柄スコア", kind: "normal", now: NOW });
  assert.equal(L.entries["h1"].status, "queued");
  assert.equal(isDelivered(L, "h1"), false);
  assert.deepEqual(pendingHashes(L, "normal"), ["h1"]);
}

// --- (2) 実送信成功後だけ sent -------------------------------------------
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "h1", section: "s", kind: "normal", now: NOW });
  markSent(L, ["h1"], NOW);
  assert.equal(isDelivered(L, "h1"), true);
  assert.deepEqual(pendingHashes(L), [], "sentはpendingに残らない");
}

// --- (3)(4) HTTP/network 失敗後も pending-retry として残る ------------------
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "h1", section: "s", kind: "normal", now: NOW });
  markFailed(L, ["h1"], "http-5xx redactedmsg", NOW);
  assert.equal(L.entries["h1"].status, "pending-retry");
  assert.equal(L.entries["h1"].attempts, 1);
  assert.ok(pendingHashes(L).includes("h1"), "失敗後も再送候補");
}

// --- attempts上限で failed（無限蓄積しない）------------------------------
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "h1", section: "s", kind: "normal", now: NOW });
  for (let i = 0; i < MAX_ATTEMPTS; i++) markFailed(L, ["h1"], "e", NOW);
  assert.equal(L.entries["h1"].status, "failed");
  assert.ok(!pendingHashes(L).includes("h1"), "上限到達は再送候補から外れる");
}

// --- (7) 成功後の再enqueueは重複送信しない（ensureEntryが触らない）---------
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "h1", section: "s", kind: "normal", now: NOW });
  markSent(L, ["h1"], NOW);
  const { action } = ensureEntry(L, { hash: "h1", section: "s", kind: "normal", now: NOW });
  assert.equal(action, "already-delivered");
  assert.deepEqual(pendingHashes(L), []);
}

// --- (8)(9)(10)(11)(12) urgent delivered count は sent時のみ ---------------
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "u1", section: "🚨 緊急開示", kind: "urgent", now: NOW });
  ensureEntry(L, { hash: "u2", section: "🚨 緊急開示", kind: "urgent", now: NOW });
  assert.equal(countUrgentDeliveredToday(L, TODAY), 0, "queuedは即時通知済みに数えない");
  markSent(L, ["u1"], NOW);
  assert.equal(countUrgentDeliveredToday(L, TODAY), 1, "sentのみ数える");
  markFailed(L, ["u2"], "http-4xx", NOW);
  assert.equal(countUrgentDeliveredToday(L, TODAY), 1, "失敗は数えない");
  assert.equal(countUrgentDeliveredToday(L, "2026-08-06"), 0, "別日は数えない");
}

// --- skipped（論理重複）は再送されない -----------------------------------
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "d1", section: "s", kind: "normal", now: NOW });
  markSkipped(L, ["d1"], NOW);
  assert.equal(L.entries["d1"].status, "skipped");
  assert.ok(!pendingHashes(L).includes("d1"));
}

// --- prune: 古いsent/skippedを掃除、pendingは残す -------------------------
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "old", section: "s", kind: "normal", now: "2026-08-01T00:00:00.000Z" });
  markSent(L, ["old"], "2026-08-01T00:00:00.000Z");
  ensureEntry(L, { hash: "keep", section: "s", kind: "normal", now: NOW });
  const { removed } = pruneLedger(L, "2026-08-03T00:00:00.000Z");
  assert.deepEqual(removed, ["old"]);
  assert.ok(L.entries["keep"], "pendingは掃除しない");
}

// =========================================================================
// D. Ledger FS ライフサイクル（tempディレクトリ・crash/再実行）
// =========================================================================

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "line-batch-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- (1) enqueueFragment は queued（delivered化しない）--------------------
withTempDir((dir) => {
  const { hash, action } = enqueueFragment(dir, { text: morningLite("1. 📌 7 T 50点"), kind: "normal" });
  assert.equal(action, "added");
  const L = loadLedger(dir);
  assert.equal(L.entries[hash].status, "queued");
  assert.equal(isDelivered(L, hash), false);
  // 同一内容の再enqueueはファイルを重複させず据え置き
  const again = enqueueFragment(dir, { text: morningLite("1. 📌 7 T 50点"), kind: "normal" });
  assert.equal(again.hash, hash);
});

// --- (5)(6) crash/失敗→再ロードでpendingが残る（同日/翌日）----------------
withTempDir((dir) => {
  enqueueFragment(dir, { text: special("・A 監視"), kind: "normal" });
  // 送信失敗をシミュレート
  let L = loadLedger(dir);
  const h = pendingHashes(L)[0];
  markFailed(L, [h], "network-error redacted", NOW);
  saveLedger(dir, L);
  // 別プロセス相当: 再ロード（同日再実行）
  L = loadLedger(dir);
  assert.ok(pendingHashes(L).includes(h), "同日再実行でfailed pendingが消えない");
  const pend = loadPendingFragments(dir, L, "normal");
  assert.equal(pend.length, 1, "本文ファイルも残っている");
  // 翌日再実行相当（today変えてもpendingは孤立しない：安定dir）
  const L2 = loadLedger(dir);
  assert.ok(pendingHashes(L2).includes(h), "翌日再実行でも前日pendingを孤立させない");
});

// --- (2)(7) 実送信成功で delivered・削除、再実行で重複送信しない -----------
withTempDir((dir) => {
  const { hash } = enqueueFragment(dir, { text: special("・B 監視"), kind: "normal" });
  let L = loadLedger(dir);
  markSent(L, [hash], NOW);
  saveLedger(dir, L);
  // 成功後の再enqueueは already-delivered
  const again = enqueueFragment(dir, { text: special("・B 監視"), kind: "normal" });
  assert.equal(again.action, "already-delivered");
  L = loadLedger(dir);
  assert.deepEqual(pendingHashes(L), [], "delivered済みは再送候補にならない");
});

// --- orphan .txt（enqueue経由でない素置き）を queued 取り込み ---------------
withTempDir((dir) => {
  // enqueue で本文だけ置いた後 ledger を消して orphan を作る
  const { hash } = enqueueFragment(dir, { text: aiNews("・orphan"), kind: "normal" });
  rmSync(join(dir, ".ledger.json"), { force: true });
  const L = reconcileOrphanFragments(dir, loadLedger(dir), NOW);
  assert.equal(L.entries[hash]?.status, "queued", "素置き.txtもqueuedとして取り込む");
});

// =========================================================================
// E. 配線（emergency-disclosure-watch のP0即時経路）
// =========================================================================

// --- (13)(14) emergency-disclosure-watch は即時経路・朝刊バッチへ回さない ---
{
  const src = readFileSync(new URL("../src/emergency-disclosure-watch.ts", import.meta.url), "utf-8");
  assert.ok(src.includes("sendUrgentDisclosure"), "(13) 即時経路 sendUrgentDisclosure を使う");
  assert.ok(!src.includes("sendPipelineSummaryNotification"), "(14) 朝刊バッチ経路は使わない");
}

// enqueue時点でdelivered記録しない（notify.tsの契約）: batchパスでrecordTextNotificationを呼ばない
{
  const notify = readFileSync(new URL("../src/notify.ts", import.meta.url), "utf-8");
  // batchDir() 分岐は enqueueNormal のみ（recordTextNotification を伴わない）
  assert.ok(notify.includes("enqueueNormal(text)"), "batchモードはenqueueのみ");
  assert.ok(!/pushLine\(/.test(notify), "成否を失う pushLine は残さない");
}

// SECTION_ORDER は緊急を先頭
assert.equal(SECTION_ORDER[0], "🚨 緊急開示");

console.log("line-consolidation.test.ts: all assertions passed");
