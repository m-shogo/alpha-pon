// LINE統合通知 + 永続ledger + envelope + urgent共通配信 + lock のテスト。
// 実ネットワークには一切接続しない（Fake/DryRunトランスポート・注入fetch・tempディレクトリのみ）。
// pnpm test で自動実行される。
//
// Round1 A〜E / Round2 / Round3 Blocking 1〜4 + 必須crash/lockケースを網羅する。

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
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
  readLedgerState,
  readBlockMarker,
  isBlocked,
  clearBlockMarker,
  findLedgerAnomalies,
  loadPendingFragments,
  reconcileOrphanFragments,
  saveLedger,
  writeEnvelope,
  readEnvelope,
  listEnvelopeHashes,
  type FragmentEnvelopeV1,
} from "../src/line-batch-queue.js";
import { deliverUrgent } from "../src/line-delivery.js";
import { sendUrgentDisclosure } from "../src/notify.js";

const TODAY = "2026-08-05";
const NOW = "2026-08-05T00:00:00.000Z";
const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

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

// テスト用に envelope をディスクへ直接置く（enqueue を経ずに crash 後の状態を再現）。
function putEnvelope(dir: string, kind: "normal" | "urgent", section: string, text: string): string {
  const hash = contentHash(text);
  writeEnvelope(dir, { version: 1, hash, kind, section, text, queuedAt: NOW });
  return hash;
}

// =========================================================================
// A. builder（fragment単位予算・決定論・重複排除）— 回帰
// =========================================================================
{
  assert.equal(buildConsolidatedMessage([], { today: TODAY }).message, null);
  const r1 = buildConsolidatedMessage([bf("📊 銘柄スコア", "7203 トヨタ 62点")], { today: TODAY });
  assert.ok(r1.message!.includes("7203 トヨタ") && r1.includedCount === 1);

  // input-order independence
  const a = bf("📊 銘柄スコア", "AAA");
  const b = bf("📊 銘柄スコア", "ZZZ");
  assert.equal(
    buildConsolidatedMessage([a, b], { today: TODAY }).message,
    buildConsolidatedMessage([b, a], { today: TODAY }).message,
  );

  // duplicate variant: hash最小代表
  const v1: BatchFragment = { hash: "ffff", section: "💎 特殊状況", body: "・XYZ 監視 https://a/1" };
  const v2: BatchFragment = { hash: "0001", section: "💎 特殊状況", body: "・XYZ  監視  https://b/2" };
  assert.equal(normalizeKey(v1.section, v1.body), normalizeKey(v2.section, v2.body));
  assert.equal(dedupeFragments([v1, v2]).representatives[0].hash, "0001");

  // fragment単位予算: 同一section3件・1件だけ収まる → 残り2件omitted/pending・sent化しない
  const long = "あ".repeat(200);
  const s = buildConsolidatedMessage(
    [bf("💎 特殊状況", "A" + long), bf("💎 特殊状況", "B" + long), bf("💎 特殊状況", "C" + long)],
    { today: TODAY, maxChars: 400 },
  );
  assert.equal(s.includedCount, 1);
  assert.equal(s.omittedItemCount, 2);
  const inc = new Set(s.includedHashes);
  for (const h of s.omittedHashes) assert.ok(!inc.has(h));

  // 単一巨大 sole-member のみ truncated
  const huge = buildConsolidatedMessage([bf("📊 銘柄スコア", "X".repeat(20000))], { today: TODAY, maxChars: 500 });
  assert.ok(huge.truncated && huge.message!.length <= 500 && huge.includedCount === 1);
  const multi = buildConsolidatedMessage(
    [bf("💎 特殊状況", "P".repeat(20000)), bf("💎 特殊状況", "Q".repeat(20000))],
    { today: TODAY, maxChars: 500 },
  );
  assert.equal(multi.truncated, false);
  assert.equal(multi.includedCount, 0);

  assert.ok(buildConsolidatedMessage([], { today: TODAY, immediateUrgentCount: 2 }).message!.includes("🚨 緊急 2 件は即時通知済み"));
}

// =========================================================================
// B. retryability / transport — 回帰
// =========================================================================
{
  assert.equal(consumesRetryBudget("http-4xx"), true);
  assert.equal(consumesRetryBudget("network-error"), true);
  assert.equal(consumesRetryBudget("dry-run"), false);
  assert.equal(consumesRetryBudget("credentials-missing"), false);

  assert.ok(createTransport({} as NodeJS.ProcessEnv) instanceof MissingCredentialsTransport);
  assert.ok(createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y", NOTIFY_MODE: "off" } as any) instanceof DryRunTransport);
  assert.equal(createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y" } as any).mode, "real");

  const th = (async () => { throw new Error("down secretTOK"); }) as unknown as typeof fetch;
  const rn = await new LineApiTransport("secretTOK", "U", th).send([]);
  assert.equal(rn.outcome, "network-error");
  assert.ok(!(rn.error ?? "").includes("secretTOK"));
  const red = redactSecrets("Bearer X to=Uabc", ["Uabc"]);
  assert.ok(red.includes("***REDACTED***") && !red.includes("Uabc"));
  assert.equal(SECTION_ORDER[0], "🚨 緊急開示");
}

// =========================================================================
// C. Ledger 純関数 + JST — 回帰
// =========================================================================
{
  const L = emptyLedger();
  ensureEntry(L, { hash: "h", section: "s", kind: "normal", now: NOW });
  assert.equal(L.entries["h"].status, "queued");
  for (let i = 0; i < MAX_ATTEMPTS; i++) markFailed(L, ["h"], "e", NOW);
  assert.equal(L.entries["h"].status, "failed");
  requeueFailed(L);
  assert.equal(L.entries["h"].status, "queued");

  // JST境界
  assert.equal(jstDateOf("2026-08-04T15:00:00.000Z"), "2026-08-05");
  assert.equal(jstDateOf("2026-08-04T23:59:00.000Z"), "2026-08-05");
  assert.equal(jstDateOf("2026-08-05T14:59:00.000Z"), "2026-08-05");
  assert.equal(jstDateOf("2026-08-04T14:59:00.000Z"), "2026-08-04");
  const U = emptyLedger();
  ensureEntry(U, { hash: "u", section: "s", kind: "urgent", now: NOW });
  markSent(U, ["u"], "2026-08-04T23:30:00.000Z"); // UTC前日/JST当日
  assert.equal(U.entries["u"].deliveredDateJst, "2026-08-05");
  assert.equal(countUrgentDeliveredToday(U, "2026-08-05"), 1);
  assert.equal(countUrgentDeliveredToday(U, "2026-08-04"), 0);
}

// =========================================================================
// D. Envelope（Round3 Blocking 3）
// =========================================================================

// envelope 検証: version/kind/hash一致
withTempDir((dir) => {
  const text = "🚨 Alpha Pon 緊急開示\n・1234 TOB";
  const hash = putEnvelope(dir, "urgent", "🚨 緊急開示", text);
  const env = readEnvelope(dir, hash);
  assert.equal(env?.kind, "urgent", "kindがdurableに復元される");
  assert.deepEqual(listEnvelopeHashes(dir), [hash]);

  // filename hash と envelope hash 不一致 → null（送信しない）
  const badHash = "deadbeefdeadbeef";
  writeFileSync(join(dir, "fragments", `${badHash}.fragment.json`),
    JSON.stringify({ version: 1, hash: badHash, kind: "normal", section: "s", text: "別内容", queuedAt: NOW }));
  assert.equal(readEnvelope(dir, badHash), null, "hash不一致は無効");

  // malformed JSON → null
  writeFileSync(join(dir, "fragments", `${"a".repeat(16)}.fragment.json`), "{ broken");
  assert.equal(readEnvelope(dir, "a".repeat(16)), null);
});

// (Blocking 3) orphan envelope 復旧: normal/urgent/TDnet の kind を保持
withTempDir((dir) => {
  const hNormal = putEnvelope(dir, "normal", "📊 銘柄スコア", "🌅 Alpha Pon Morning Lite\n1. 7203 62点");
  const hScoreUrg = putEnvelope(dir, "urgent", "🚨 緊急開示", "🚨 7203 トヨタ 88点\n  区分: 事実");
  const hTdnet = putEnvelope(dir, "urgent", "🚨 緊急開示", "🚨 Alpha Pon 緊急開示\n・1234 TOB");
  const L = reconcileOrphanFragments(dir, emptyLedger(), NOW);
  assert.equal(L.entries[hNormal].kind, "normal", "normal orphan→normal");
  assert.equal(L.entries[hScoreUrg].kind, "urgent", "ScoreResult urgent orphan→urgent（本文推測に依存しない）");
  assert.equal(L.entries[hTdnet].kind, "urgent", "TDnet urgent orphan→urgent");
  // urgent は urgent の pending として取り出せる（朝刊normalへ降格しない）
  const urg = loadPendingFragments(dir, L, "urgent").map((f) => f.hash).sort();
  assert.deepEqual(urg, [hScoreUrg, hTdnet].sort());
  const nrm = loadPendingFragments(dir, L, "normal").map((f) => f.hash);
  assert.deepEqual(nrm, [hNormal]);
});

// malformed envelope は送信対象にならず anomaly
withTempDir((dir) => {
  mkdirSync(join(dir, "fragments"), { recursive: true });
  writeFileSync(join(dir, "fragments", `${"b".repeat(16)}.fragment.json`), "{ broken json");
  const L = reconcileOrphanFragments(dir, emptyLedger(), NOW);
  assert.deepEqual(Object.keys(L.entries), [], "malformedは取り込まない");
  assert.ok(findLedgerAnomalies(dir, L).malformedEnvelopes.length >= 1);
});

// legacy .txt: ledger entryあり→ledger kindで移行、なし&曖昧→ambiguous(送信しない)
withTempDir((dir) => {
  // ambiguous legacy（🚨単独の銘柄urgent風。契約上確定不能）
  const ambText = "🚨 7203 トヨタ 88点";
  const ambHash = contentHash(ambText);
  writeFileSync(join(dir, `${ambHash}.txt`), ambText);
  // 契約確定できる TDnet legacy
  const tdText = "🚨 Alpha Pon 緊急開示\n・9999 上場廃止";
  const tdHash = contentHash(tdText);
  writeFileSync(join(dir, `${tdHash}.txt`), tdText);
  const L = reconcileOrphanFragments(dir, emptyLedger(), NOW);
  assert.equal(L.entries[ambHash], undefined, "曖昧legacyは勝手に送らない");
  assert.equal(L.entries[tdHash]?.kind, "urgent", "契約確定できるTDnet legacyのみurgent移行");
  assert.ok(findLedgerAnomalies(dir, L).ambiguousLegacy.includes(ambHash));

  // legacy .txt + ledger entry → ledger kind で envelope 化
  const withText = "🌅 Alpha Pon Morning Lite\n本文";
  const withHash = contentHash(withText);
  writeFileSync(join(dir, `${withHash}.txt`), withText);
  const L2 = emptyLedger();
  ensureEntry(L2, { hash: withHash, section: "📊 銘柄スコア", kind: "normal", now: NOW });
  reconcileOrphanFragments(dir, L2, NOW);
  assert.equal(readEnvelope(dir, withHash)?.kind, "normal", "ledger kindでenvelope移行");
});

// =========================================================================
// E. enqueue と block marker（Round3 Blocking 1）
// =========================================================================

// 正常 enqueue → envelope + queued
withTempDir((dir) => {
  const { hash, action } = enqueueFragment(dir, { text: "🌅 Alpha Pon Morning Lite\nT", kind: "normal" });
  assert.equal(action, "added");
  assert.equal(loadLedger(dir).entries[hash].status, "queued");
  assert.equal(readEnvelope(dir, hash)?.kind, "normal");
});

// (Blocking 1) corrupt ledger → normal enqueue: envelope保全・空ledger置換しない・block marker
withTempDir((dir) => {
  writeFileSync(join(dir, ".ledger.json"), "{ not json");
  const { hash, action } = enqueueFragment(dir, { text: "🌅 Alpha Pon Morning Lite\nX", kind: "normal" });
  assert.equal(action, "ledger-corrupt");
  assert.ok(readEnvelope(dir, hash), "fragment envelopeは保全");
  assert.ok(isBlocked(dir), "block markerが残る");
  const m = readBlockMarker(dir);
  assert.equal(m?.reason, "ledger-corrupt");
  // 破損ledgerは正常ledgerで上書きされない（.ledger.jsonは退避、markerが支配）
  assert.ok(!existsSync(join(dir, ".ledger.json")), "破損ledgerは退避され空ledgerで上書きしない");
});

// (Blocking 1) corrupt ledger → urgent enqueue: kind保全・block・transport未呼出
await withTempDir(async (dir) => {
  writeFileSync(join(dir, ".ledger.json"), "broken{");
  const t = fakeTransport("real", OK);
  const text = "🚨 Alpha Pon 緊急開示\n・1234 TOB";
  const res = await deliverUrgent(dir, t, { text, section: "🚨 緊急開示", messages: [{ type: "text", text }] });
  assert.equal(res.outcome, "ledger-corrupt");
  assert.equal(t.calls, 0, "破損時はtransportを呼ばない");
  const hash = contentHash(text);
  assert.equal(readEnvelope(dir, hash)?.kind, "urgent", "urgent kind保全");
  assert.ok(isBlocked(dir));
});

// (Blocking 1) block marker 存在時: enqueue は ledger-blocked、sender safe stop
await withTempDir(async (dir) => {
  writeFileSync(join(dir, ".ledger-blocked.json"), JSON.stringify({ reason: "ledger-corrupt", detectedAt: NOW }));
  const e = enqueueFragment(dir, { text: "🌅 x\nbody", kind: "normal" });
  assert.equal(e.action, "ledger-blocked");
  assert.ok(readEnvelope(dir, e.hash), "本文は保全");
  // deliverUrgent も blocked
  const t = fakeTransport("real", OK);
  const text = "🚨 Alpha Pon 緊急開示\n・1 TOB";
  const r = await deliverUrgent(dir, t, { text, messages: [{ type: "text", text }] });
  assert.equal(r.outcome, "ledger-blocked");
  assert.equal(t.calls, 0);
  // clearBlockMarker で復旧可能
  clearBlockMarker(dir);
  assert.equal(isBlocked(dir), false);
});

// =========================================================================
// F. deliverUrgent（Round2 B/D + Round3 Blocking 2）
// =========================================================================

// dry-run ×3: pending維持・attempts非消費
await withTempDir(async (dir) => {
  const t = fakeTransport("dry-run", DRY);
  for (let i = 0; i < 3; i++) {
    assert.equal((await deliverUrgent(dir, t, { text: "🚨 U1", messages: [{ type: "text", text: "🚨 U1" }] })).outcome, "dry-run");
  }
  const h = contentHash("🚨 U1");
  assert.equal(loadLedger(dir).entries[h].attempts, 0);
  assert.equal(readEnvelope(dir, h)?.kind, "urgent");
});

// credentials-missing ×6 → pending維持 → real success 1回 → 2回目skip
await withTempDir(async (dir) => {
  const nocred = fakeTransport("real", NOCRED);
  for (let i = 0; i < 6; i++) {
    assert.equal((await deliverUrgent(dir, nocred, { text: "🚨 U2", messages: [{ type: "text", text: "🚨 U2" }] })).outcome, "credentials-missing");
  }
  const h = contentHash("🚨 U2");
  assert.equal(loadLedger(dir).entries[h].attempts, 0, "creds不足はattempts非消費");
  const ok = fakeTransport("real", OK);
  assert.equal((await deliverUrgent(dir, ok, { text: "🚨 U2", messages: [{ type: "text", text: "🚨 U2" }] })).outcome, "sent");
  assert.equal((await deliverUrgent(dir, ok, { text: "🚨 U2", messages: [{ type: "text", text: "🚨 U2" }] })).outcome, "skipped-already-sent");
  assert.equal(ok.calls, 1, "実送信1回だけ");
  assert.equal(readEnvelope(dir, h), null, "成功後envelope削除");
});

// TDnet同日2回 → transport 1回（送信前dedupe・再起動相当）
await withTempDir(async (dir) => {
  const ok1 = fakeTransport("real", OK);
  const text = "🚨 Alpha Pon 緊急開示\n・1234 TOB";
  assert.equal((await deliverUrgent(dir, ok1, { text, messages: [{ type: "text", text }] })).outcome, "sent");
  const ok2 = fakeTransport("real", OK);
  assert.equal((await deliverUrgent(dir, ok2, { text, messages: [{ type: "text", text }] })).outcome, "skipped-already-sent");
  assert.equal(ok1.calls + ok2.calls, 1);
});

// HTTP失敗→pending-retry(同一entry)→success、network→pending-retry
await withTempDir(async (dir) => {
  const text = "🚨 U3";
  const h = contentHash(text);
  assert.equal((await deliverUrgent(dir, fakeTransport("real", HTTP4), { text, messages: [{ type: "text", text }] })).outcome, "http-4xx");
  assert.equal(loadLedger(dir).entries[h].status, "pending-retry");
  assert.equal((await deliverUrgent(dir, fakeTransport("real", OK), { text, messages: [{ type: "text", text }] })).outcome, "sent");
  assert.equal(Object.keys(loadLedger(dir).entries).length, 1, "entryを増やさない");

  const text2 = "🚨 U4";
  assert.equal((await deliverUrgent(dir, fakeTransport("real", NET), { text: text2, messages: [{ type: "text", text: text2 }] })).outcome, "network-error");
  assert.equal(loadLedger(dir).entries[contentHash(text2)].status, "pending-retry");
});

// failed(上限)は自動再送しない
await withTempDir(async (dir) => {
  const text = "🚨 U5";
  const h = contentHash(text);
  enqueueFragment(dir, { text, kind: "urgent" });
  const L = loadLedger(dir);
  for (let i = 0; i < MAX_ATTEMPTS; i++) markFailed(L, [h], "e", NOW);
  saveLedger(dir, L);
  const ok = fakeTransport("real", OK);
  assert.equal((await deliverUrgent(dir, ok, { text, messages: [{ type: "text", text }] })).outcome, "failed-max-attempts");
  assert.equal(ok.calls, 0);
});

// (Blocking 2) corrupt ledger → sendUrgentDisclosure は throw せず daily を止めない
await withTempDir(async (dir) => {
  const prev = process.env.LINE_BATCH_DIR;
  process.env.LINE_BATCH_DIR = dir;
  try {
    writeFileSync(join(dir, ".ledger.json"), "corrupt{{");
    const text = "🚨 Alpha Pon 緊急開示\n・5678 MBO";
    await assert.doesNotReject(sendUrgentDisclosure(text), "ledger破損でも例外を投げない（daily継続）");
    assert.ok(isBlocked(dir), "破損はblock markerで停止");
    assert.equal(readEnvelope(dir, contentHash(text))?.kind, "urgent", "本文はenvelopeで保全");
  } finally {
    if (prev === undefined) delete process.env.LINE_BATCH_DIR;
    else process.env.LINE_BATCH_DIR = prev;
  }
});

// =========================================================================
// G. full complete pipeline lock（Round3 Blocking 4）— bash 経由
// =========================================================================
{
  const lockScript = (body: string) =>
    execSync(`bash -c 'set -u; source "${REPO}/scripts/pipeline-lock.sh"; ${body}'`, { encoding: "utf-8" });

  // 取得成功 → 同時2run目はskip → release後に再取得可能
  {
    const L = mkdtempSync(join(tmpdir(), "lockp-")) + "/lock.d";
    const out = lockScript(
      `Lk="${L}"; pl_acquire "$Lk" && echo A1_OK; ( pl_acquire "$Lk" && echo A2_GOT || echo A2_SKIP ); pl_release; pl_acquire "$Lk" && echo A3_OK; pl_release`,
    );
    assert.ok(out.includes("A1_OK"), "1run目は取得成功");
    assert.ok(out.includes("A2_SKIP"), "同時2run目はskip(ledger未書込)");
    assert.ok(out.includes("A3_OK"), "cleanup後は次runが取得可能");
    rmSync(L.replace(/\/lock\.d$/, ""), { recursive: true, force: true });
  }

  // live PID の lock は奪わない
  {
    const base = mkdtempSync(join(tmpdir(), "lockl-"));
    const L = join(base, "lock.d");
    const out = lockScript(`Lk="${L}"; mkdir "$Lk"; echo $$ > "$Lk/pid"; pl_acquire "$Lk" && echo GOT || echo BLOCKED`);
    assert.ok(out.includes("BLOCKED"), "生存PIDのlockは奪わない");
    rmSync(base, { recursive: true, force: true });
  }

  // stale lock（死亡PID）は退避して再取得
  {
    const base = mkdtempSync(join(tmpdir(), "locks-"));
    const L = join(base, "lock.d");
    const out = lockScript(`Lk="${L}"; mkdir "$Lk"; echo 999999 > "$Lk/pid"; date -u '+%FT%TZ' > "$Lk/started_at"; pl_acquire "$Lk" && echo REACQUIRED || echo STILL_LOCKED; pl_release`);
    assert.ok(out.includes("REACQUIRED"), "stale lockは安全に退避して再取得");
    rmSync(base, { recursive: true, force: true });
  }
}

// =========================================================================
// H. 配線
// =========================================================================
{
  const src = readFileSync(new URL("../src/emergency-disclosure-watch.ts", import.meta.url), "utf-8");
  assert.ok(src.includes("sendUrgentDisclosure") && !src.includes("sendPipelineSummaryNotification"));
  const notify = readFileSync(new URL("../src/notify.ts", import.meta.url), "utf-8");
  assert.ok(notify.includes("safeDeliverUrgent"), "urgentは非致命ラッパ経由");
  assert.ok(!/\bpushLine\(/.test(notify));
  const complete = readFileSync(new URL("../scripts/run-daily-complete.sh", import.meta.url), "utf-8");
  assert.ok(complete.includes("pl_acquire") && complete.includes("skipped_locked"), "complete pipeline lock配線");
}

console.log("line-consolidation.test.ts: all assertions passed");
