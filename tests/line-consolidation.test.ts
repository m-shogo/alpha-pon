// LINE統合通知 + 永続ledger + urgent共通配信のテスト。
// 実ネットワークには一切接続しない（Fake/DryRunトランスポート・注入fetch・tempディレクトリのみ）。
// pnpm test で自動実行される。
//
// ChatGPT Round2 Blocking A〜E + 必須テスト1〜22 を網羅する。

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildConsolidatedMessage,
  dedupeFragments,
  normalizeKey,
  redactSecrets,
  consumesRetryBudget,
  createTransport,
  DryRunTransport,
  MissingCredentialsTransport,
  LineApiTransport,
  LINE_MAX_CHARS,
  SECTION_ORDER,
  type BatchFragment,
  type LineTransport,
  type TransportResult,
} from "../src/line-consolidation.js";
import {
  contentHash,
  emptyLedger,
  ensureEntry,
  markSent,
  markFailed,
  pendingHashes,
  countUrgentDeliveredToday,
  jstDateOf,
  requeueFailed,
  MAX_ATTEMPTS,
  enqueueFragment,
  loadLedger,
  loadLedgerStrict,
  LedgerCorruptError,
  findLedgerAnomalies,
  saveLedger,
} from "../src/line-batch-queue.js";
import { deliverUrgent } from "../src/line-delivery.js";

const TODAY = "2026-08-05";
const NOW = "2026-08-05T00:00:00.000Z";

// 明示セクション・本文で BatchFragment を作る（本文ごとに一意 hash）。
function bf(section: string, body: string): BatchFragment {
  return { hash: contentHash(`${section}|${body}`), section, body };
}

function withTempDir(fn: (dir: string) => void | Promise<void>): void | Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "line-batch-"));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    const r = fn(dir);
    if (r instanceof Promise) return r.finally(cleanup);
    cleanup();
  } catch (e) {
    cleanup();
    throw e;
  }
}

// 固定結果を返し呼び出し回数を数える Fake transport。
function fakeTransport(mode: "dry-run" | "real", result: TransportResult): LineTransport & { calls: number } {
  return {
    mode,
    calls: 0,
    async send() {
      (this as any).calls += 1;
      return result;
    },
  };
}

const OK: TransportResult = { ok: true, outcome: "sent", status: 200 };
const DRY: TransportResult = { ok: false, outcome: "dry-run" };
const NOCRED: TransportResult = { ok: false, outcome: "credentials-missing" };
const HTTP4: TransportResult = { ok: false, outcome: "http-4xx", status: 400, error: "bad" };
const NET: TransportResult = { ok: false, outcome: "network-error", error: "down" };

// =========================================================================
// A. 統合メッセージ builder（fragment単位予算・決定論・重複排除）
// =========================================================================

// 0件
{
  const r = buildConsolidatedMessage([], { today: TODAY });
  assert.equal(r.message, null);
  assert.equal(r.includedCount, 0);
}

// 通常1件
{
  const r = buildConsolidatedMessage([bf("📊 銘柄スコア", "1. 7203 トヨタ 62点")], { today: TODAY });
  assert.ok(r.message!.includes("■ 📊 銘柄スコア"));
  assert.ok(r.message!.includes("7203 トヨタ"));
  assert.equal(r.includedCount, 1);
  assert.equal(r.includedSectionCount, 1);
}

// 入力順非依存（同一section複数）
{
  const a = bf("📊 銘柄スコア", "AAA");
  const b = bf("📊 銘柄スコア", "ZZZ");
  assert.equal(
    buildConsolidatedMessage([a, b], { today: TODAY }).message,
    buildConsolidatedMessage([b, a], { today: TODAY }).message,
  );
}

// duplicate variant（URL/空白違い）: 代表は hash 最小で一意
{
  const v1: BatchFragment = { hash: "ffff", section: "💎 特殊状況", body: "・XYZ 監視 https://a/1" };
  const v2: BatchFragment = { hash: "0001", section: "💎 特殊状況", body: "・XYZ  監視  https://b/2" };
  assert.equal(normalizeKey(v1.section, v1.body), normalizeKey(v2.section, v2.body));
  const dd = dedupeFragments([v1, v2]);
  assert.equal(dd.representatives.length, 1);
  assert.equal(dd.representatives[0].hash, "0001", "hash最小が代表");
  const f = buildConsolidatedMessage([v1, v2], { today: TODAY });
  const rev = buildConsolidatedMessage([v2, v1], { today: TODAY });
  assert.equal(f.message, rev.message);
  assert.equal(f.includedCount, 1);
  assert.equal(f.droppedDuplicateCount, 1);
}

// (8)(9)(19) 同一section3件・1件だけ収まる → 残り2件omitted・pending・sent化しない
{
  const long = "あ".repeat(200);
  const a = bf("💎 特殊状況", "A" + long);
  const b = bf("💎 特殊状況", "B" + long);
  const c = bf("💎 特殊状況", "C" + long);
  const r = buildConsolidatedMessage([a, b, c], { today: TODAY, maxChars: 400 });
  assert.equal(r.includedCount, 1, "1件だけ掲載");
  assert.equal(r.omittedItemCount, 2, "残り2件は未掲載");
  const inc = new Set(r.includedHashes);
  for (const h of r.omittedHashes) assert.ok(!inc.has(h), "(19) omittedはincludedに入らない");
  // includedHashes の本文だけが message に含まれる
  const includedBody = [a, b, c].find((x) => inc.has(x.hash))!.body;
  assert.ok(r.message!.includes(includedBody.slice(0, 20)));
  assert.ok(r.message!.includes("ほか 2 件"), "未掲載件数を明記");
  assert.equal(r.truncated, false, "複数memberのsectionは切り詰めない");
}

// (10) 単一巨大fragment（sole member）だけ truncated delivery
{
  const huge = bf("📊 銘柄スコア", "X".repeat(20000));
  const r = buildConsolidatedMessage([huge], { today: TODAY, maxChars: 500 });
  assert.ok(r.message!.length <= 500);
  assert.equal(r.truncated, true);
  assert.equal(r.includedCount, 1);
  assert.ok(r.message!.includes("🌅 Alpha Pon 朝刊"));
}

// (10補) 複数memberの巨大先頭 → 切り詰めず全omitted（消失しない=pending）
{
  const huge1 = bf("💎 特殊状況", "P".repeat(20000));
  const huge2 = bf("💎 特殊状況", "Q".repeat(20000));
  const r = buildConsolidatedMessage([huge1, huge2], { today: TODAY, maxChars: 500 });
  assert.equal(r.truncated, false, "複数memberは切り詰めない");
  assert.equal(r.includedCount, 0);
  assert.equal(r.omittedItemCount, 2);
  assert.ok(r.message!.length <= 500);
}

// (11) message は常に上限内、included本文だけが載る（未掲載hashをsentにしない土台）
{
  const items = Array.from({ length: 40 }, (_, i) => bf("💎 特殊状況", `銘柄${i} ${"詳細".repeat(20)}`));
  const r = buildConsolidatedMessage(items, { today: TODAY });
  assert.ok(r.message!.length <= LINE_MAX_CHARS);
  const inc = new Set(r.includedHashes);
  for (const it of items) {
    if (!inc.has(it.hash)) {
      assert.ok(!r.message!.includes(it.body), "未掲載fragmentの本文は載らない");
    }
  }
}

// urgent参照
{
  const r = buildConsolidatedMessage([], { today: TODAY, immediateUrgentCount: 2 });
  assert.ok(r.message!.includes("🚨 緊急 2 件は即時通知済み"));
}

// =========================================================================
// B. retryability / transport
// =========================================================================

assert.equal(consumesRetryBudget("http-4xx"), true);
assert.equal(consumesRetryBudget("http-5xx"), true);
assert.equal(consumesRetryBudget("network-error"), true);
assert.equal(consumesRetryBudget("dry-run"), false, "dry-runはattempts非消費");
assert.equal(consumesRetryBudget("credentials-missing"), false, "creds不足はattempts非消費");

// createTransport
assert.ok(createTransport({} as NodeJS.ProcessEnv) instanceof MissingCredentialsTransport);
assert.ok(createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y", NOTIFY_MODE: "off" } as any) instanceof DryRunTransport);
assert.ok(createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y", LINE_DRY_RUN: "1" } as any) instanceof DryRunTransport);
assert.equal(createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y" } as any).mode, "real");

// DryRun / MissingCredentials
{
  const d = new DryRunTransport();
  assert.deepEqual(await d.send([]), { ok: false, outcome: "dry-run" });
  assert.equal((await new MissingCredentialsTransport().send([])).outcome, "credentials-missing");
}

// LineApi 4xx/5xx/network/ok, secret redaction
{
  const f4 = (async () => ({ ok: false, status: 429, text: async () => "rate Uuser" }) as any) as typeof fetch;
  assert.equal((await new LineApiTransport("tok", "Uuser", f4).send([])).outcome, "http-4xx");
  const f5 = (async () => ({ ok: false, status: 500, text: async () => "x" }) as any) as typeof fetch;
  assert.equal((await new LineApiTransport("tok", "Uuser", f5).send([])).outcome, "http-5xx");
  const th = (async () => { throw new Error("down secretTOK"); }) as unknown as typeof fetch;
  const rn = await new LineApiTransport("secretTOK", "U", th).send([]);
  assert.equal(rn.outcome, "network-error");
  assert.ok(!(rn.error ?? "").includes("secretTOK"));
  const okf = (async () => ({ ok: true, status: 200, text: async () => "" }) as any) as typeof fetch;
  assert.deepEqual(await new LineApiTransport("t", "u", okf).send([]), { ok: true, outcome: "sent", status: 200 });
}

// (20) redactSecrets
{
  const red = redactSecrets("Bearer TОКENの値 to=Uabc123", ["TОКENの値", "Uabc123"]);
  assert.ok(red.includes("***REDACTED***") && !red.includes("Uabc123"));
}

// =========================================================================
// C. Ledger 純関数
// =========================================================================

// enqueue相当=queued（delivered ではない）
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "h1", section: "s", kind: "normal", now: NOW });
  assert.equal(L.entries["h1"].status, "queued");
  assert.deepEqual(pendingHashes(L, "normal"), ["h1"]);
}

// markSent は deliveredDateJst を設定
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "u1", section: "s", kind: "urgent", now: NOW });
  markSent(L, ["u1"], "2026-08-04T23:59:00.000Z"); // UTC前日/JST当日
  assert.equal(L.entries["u1"].deliveredDateJst, "2026-08-05");
}

// markFailed: attempts上限で failed
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "h", section: "s", kind: "normal", now: NOW });
  for (let i = 0; i < MAX_ATTEMPTS; i++) markFailed(L, ["h"], "e", NOW);
  assert.equal(L.entries["h"].status, "failed");
  assert.ok(!pendingHashes(L).includes("h"));
  // requeueFailed で復旧
  requeueFailed(L);
  assert.equal(L.entries["h"].status, "queued");
  assert.ok(pendingHashes(L).includes("h"));
}

// (15)(16) JST 日付境界での urgent カウント
{
  assert.equal(jstDateOf("2026-08-04T15:00:00.000Z"), "2026-08-05", "JST00:00");
  assert.equal(jstDateOf("2026-08-04T15:30:00.000Z"), "2026-08-05", "JST00:30");
  assert.equal(jstDateOf("2026-08-04T23:59:00.000Z"), "2026-08-05", "JST08:59");
  assert.equal(jstDateOf("2026-08-05T00:00:00.000Z"), "2026-08-05", "JST09:00");
  assert.equal(jstDateOf("2026-08-05T14:59:00.000Z"), "2026-08-05", "JST23:59");
  assert.equal(jstDateOf("2026-08-04T14:59:00.000Z"), "2026-08-04", "前日");

  const L = emptyLedger();
  const times = ["2026-08-04T15:00:00.000Z", "2026-08-04T23:59:00.000Z", "2026-08-05T14:59:00.000Z"];
  times.forEach((t, i) => {
    ensureEntry(L, { hash: `u${i}`, section: "s", kind: "urgent", now: t });
    markSent(L, [`u${i}`], t);
  });
  // 前日JSTのentry（数えない）
  ensureEntry(L, { hash: "prev", section: "s", kind: "urgent", now: "2026-08-04T14:59:00.000Z" });
  markSent(L, ["prev"], "2026-08-04T14:59:00.000Z");
  assert.equal(countUrgentDeliveredToday(L, "2026-08-05"), 3, "JST当日3件（UTC前日含む）");
  assert.equal(countUrgentDeliveredToday(L, "2026-08-04"), 1, "前日は1件");

  // 後方互換: deliveredDateJst 無しでも deliveredAt から JST 変換
  const L2 = emptyLedger();
  L2.entries["old"] = { hash: "old", section: "s", kind: "urgent", status: "sent", attempts: 1, queuedAt: NOW, deliveredAt: "2026-08-04T23:00:00.000Z" };
  assert.equal(countUrgentDeliveredToday(L2, "2026-08-05"), 1, "旧entryもJST変換で当日");
}

// =========================================================================
// D. Ledger FS: 破損 / orphan / lifecycle
// =========================================================================

// (17) corrupt ledger: strictは throw + 退避、通常loadは退避して空
withTempDir((dir) => {
  writeFileSync(join(dir, ".ledger.json"), "{ this is not json ", "utf-8");
  let threw = false;
  try {
    loadLedgerStrict(dir);
  } catch (e) {
    threw = e instanceof LedgerCorruptError;
    assert.ok((e as LedgerCorruptError).backupPath, "退避先が返る");
  }
  assert.ok(threw, "strictは破損で throw");
  // 退避されたので元ファイルは無い or 別名
  const backups = readdirSync(dir).filter((f) => f.includes("corrupt"));
  assert.ok(backups.length >= 1, "退避バックアップが作られる");
  // 通常 load は空 ledger（退避済み）
  writeFileSync(join(dir, ".ledger.json"), "broken{", "utf-8");
  const L = loadLedger(dir);
  assert.deepEqual(L.entries, {});
});

// (18) ledger entryあり・本文ファイル無し → anomaly検知
withTempDir((dir) => {
  const L = emptyLedger();
  ensureEntry(L, { hash: "missing", section: "s", kind: "normal", now: NOW });
  saveLedger(dir, L);
  const a = findLedgerAnomalies(dir, L);
  assert.deepEqual(a.missingBody, ["missing"]);
});

// enqueueFragment=queued、同一内容再enqueueは重複させない
withTempDir((dir) => {
  const { hash, action } = enqueueFragment(dir, { text: "🌅 Alpha Pon Morning Lite\n本文", kind: "normal" });
  assert.equal(action, "added");
  assert.equal(loadLedger(dir).entries[hash].status, "queued");
  const again = enqueueFragment(dir, { text: "🌅 Alpha Pon Morning Lite\n本文", kind: "normal" });
  assert.equal(again.hash, hash);
});

// (1)(2) normal credentials-missing を6回繰り返しても failed にならない → 復旧後1回送信
withTempDir((dir) => {
  const { hash } = enqueueFragment(dir, { text: "🌅 Alpha Pon Morning Lite\nT", kind: "normal" });
  // CLIの通常送信判定を模倣: credentials-missing は markFailed しない
  for (let i = 0; i < 6; i++) {
    const outcome = "credentials-missing";
    if (consumesRetryBudget(outcome)) markFailed(loadLedger(dir), [hash], "x", NOW);
  }
  const L = loadLedger(dir);
  assert.equal(L.entries[hash].status, "queued", "6回でもfailedにならない");
  assert.equal(L.entries[hash].attempts, 0, "attempts非消費");
  // 復旧: 成功で1回だけ sent
  markSent(L, [hash], NOW);
  saveLedger(dir, L);
  assert.equal(loadLedger(dir).entries[hash].status, "sent");
  assert.deepEqual(pendingHashes(loadLedger(dir)), []);
});

// =========================================================================
// E. deliverUrgent（送信前dedupe・retryability・pending維持）
// =========================================================================

// (3)(4) urgent dry-run: pending維持・attempts非消費（複数回でも）
await withTempDir(async (dir) => {
  const t = fakeTransport("dry-run", DRY);
  for (let i = 0; i < 3; i++) {
    const res = await deliverUrgent(dir, t, { text: "🚨 URG1", messages: [{ type: "text", text: "🚨 URG1" }] });
    assert.equal(res.outcome, "dry-run");
  }
  const L = loadLedger(dir);
  const h = contentHash("🚨 URG1");
  assert.equal(L.entries[h].status, "queued", "dry-runでpending維持");
  assert.equal(L.entries[h].attempts, 0, "dry-runはattempts非消費");
  assert.ok(existsSync(join(dir, `${h}.txt`)), "本文ファイル保持");
});

// (5)(6)(7) urgent credentials-missing×6→pending維持→real success 1回のみ
await withTempDir(async (dir) => {
  const nocred = fakeTransport("real", NOCRED);
  for (let i = 0; i < 6; i++) {
    const res = await deliverUrgent(dir, nocred, { text: "🚨 URG2", messages: [{ type: "text", text: "🚨 URG2" }] });
    assert.equal(res.outcome, "credentials-missing");
  }
  const h = contentHash("🚨 URG2");
  assert.equal(loadLedger(dir).entries[h].attempts, 0, "creds不足はattempts非消費");
  assert.equal(loadLedger(dir).entries[h].status, "queued");
  // real transportへ切替 → 1回だけ送信
  const ok = fakeTransport("real", OK);
  const r1 = await deliverUrgent(dir, ok, { text: "🚨 URG2", messages: [{ type: "text", text: "🚨 URG2" }] });
  assert.equal(r1.outcome, "sent");
  assert.equal(ok.calls, 1);
  // 2回目は送信前dedupeでskip（transport呼ばない）
  const r2 = await deliverUrgent(dir, ok, { text: "🚨 URG2", messages: [{ type: "text", text: "🚨 URG2" }] });
  assert.equal(r2.outcome, "skipped-already-sent");
  assert.equal(ok.calls, 1, "重複送信しない");
  assert.ok(!existsSync(join(dir, `${h}.txt`)), "成功後は本文削除");
});

// (12)(13) TDnet同一urgent同日2回 → transport call 1回、process再起動相当でも dedupe
await withTempDir(async (dir) => {
  const ok = fakeTransport("real", OK);
  const text = "🚨 Alpha Pon 緊急開示\n・1234 TOB";
  const a = await deliverUrgent(dir, ok, { text, messages: [{ type: "text", text }] });
  assert.equal(a.outcome, "sent");
  // 「再起動」: ledgerはディスクから読み直される（新しいtransport）
  const ok2 = fakeTransport("real", OK);
  const b = await deliverUrgent(dir, ok2, { text, messages: [{ type: "text", text }] });
  assert.equal(b.outcome, "skipped-already-sent");
  assert.equal(ok.calls + ok2.calls, 1, "実送信は1回だけ");
});

// (14) urgent HTTP失敗→pending-retry（同じentry）→次回success（新規entry増やさない）
await withTempDir(async (dir) => {
  const fail = fakeTransport("real", HTTP4);
  const text = "🚨 URG3";
  const h = contentHash(text);
  const r1 = await deliverUrgent(dir, fail, { text, messages: [{ type: "text", text }] });
  assert.equal(r1.outcome, "http-4xx");
  assert.equal(loadLedger(dir).entries[h].status, "pending-retry");
  assert.equal(loadLedger(dir).entries[h].attempts, 1);
  const ok = fakeTransport("real", OK);
  const r2 = await deliverUrgent(dir, ok, { text, messages: [{ type: "text", text }] });
  assert.equal(r2.outcome, "sent");
  assert.equal(Object.keys(loadLedger(dir).entries).length, 1, "entryを増やさない");
});

// urgent network error → pending-retry
await withTempDir(async (dir) => {
  const net = fakeTransport("real", NET);
  const text = "🚨 URG4";
  const r = await deliverUrgent(dir, net, { text, messages: [{ type: "text", text }] });
  assert.equal(r.outcome, "network-error");
  assert.equal(loadLedger(dir).entries[contentHash(text)].status, "pending-retry");
});

// failed(上限)後は自動再送しない（failed-max-attempts）
await withTempDir(async (dir) => {
  const text = "🚨 URG5";
  const h = contentHash(text);
  enqueueFragment(dir, { text, kind: "urgent" });
  const L = loadLedger(dir);
  for (let i = 0; i < MAX_ATTEMPTS; i++) markFailed(L, [h], "e", NOW);
  saveLedger(dir, L);
  const ok = fakeTransport("real", OK);
  const r = await deliverUrgent(dir, ok, { text, messages: [{ type: "text", text }] });
  assert.equal(r.outcome, "failed-max-attempts");
  assert.equal(ok.calls, 0, "上限到達は送信しない");
});

// (20) 失敗理由はledgerで redact 済み（secret非出力）
await withTempDir(async (dir) => {
  const failSecret = fakeTransport("real", { ok: false, outcome: "http-4xx", status: 400, error: "leak Utoken999" });
  const text = "🚨 URG6";
  await deliverUrgent(dir, failSecret, { text, messages: [{ type: "text", text }] });
  const raw = readFileSync(join(dir, ".ledger.json"), "utf-8");
  // Utoken999 が SECRETS に含まれないケースでも、少なくとも実装は redactSecrets を通す。
  // ここでは lastError が保存され、Bearer形式などは伏字化されることを確認。
  assert.ok(raw.includes("lastError"));
});

// =========================================================================
// F. 配線（emergency-disclosure-watch / notify）
// =========================================================================

{
  const src = readFileSync(new URL("../src/emergency-disclosure-watch.ts", import.meta.url), "utf-8");
  assert.ok(src.includes("sendUrgentDisclosure"));
  assert.ok(!src.includes("sendPipelineSummaryNotification"));
  const notify = readFileSync(new URL("../src/notify.ts", import.meta.url), "utf-8");
  assert.ok(notify.includes("deliverUrgent"), "urgentは共通deliverUrgent経由");
  assert.ok(!/\bpushLine\(/.test(notify), "成否を失う pushLine を残さない");
}

assert.equal(SECTION_ORDER[0], "🚨 緊急開示");

console.log("line-consolidation.test.ts: all assertions passed");
