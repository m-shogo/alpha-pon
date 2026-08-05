// LINE統合通知 + 永続ledger + urgent配信 + pipeline lock の回帰テスト。
// 実ネットワークには接続しない。

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";
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
    const result = fn(dir);
    if (result instanceof Promise) return result.finally(cleanup);
    cleanup();
  } catch (error) {
    cleanup();
    throw error;
  }
}

function fakeTransport(mode: "dry-run" | "real", result: TransportResult): LineTransport & { calls: number } {
  return {
    mode,
    calls: 0,
    async send() {
      this.calls += 1;
      return result;
    },
  };
}

const OK: TransportResult = { ok: true, outcome: "sent", status: 200 };
const DRY: TransportResult = { ok: false, outcome: "dry-run" };
const NOCRED: TransportResult = { ok: false, outcome: "credentials-missing" };
const HTTP4: TransportResult = { ok: false, outcome: "http-4xx", status: 400, error: "bad" };
const NET: TransportResult = { ok: false, outcome: "network-error", error: "down" };

function putEnvelope(dir: string, kind: "normal" | "urgent", section: string, text: string): string {
  const hash = contentHash(text);
  writeEnvelope(dir, { version: 1, hash, kind, section, text, queuedAt: NOW });
  return hash;
}

// =========================================================================
// A. builder: 決定論・fragment単位予算・巨大fragment隔離
// =========================================================================
{
  assert.equal(buildConsolidatedMessage([], { today: TODAY }).message, null);
  const one = buildConsolidatedMessage([bf("📊 銘柄スコア", "7203 トヨタ 62点")], { today: TODAY });
  assert.ok(one.message?.includes("7203 トヨタ"));
  assert.equal(one.includedCount, 1);

  const a = bf("📊 銘柄スコア", "AAA");
  const b = bf("📊 銘柄スコア", "ZZZ");
  assert.equal(
    buildConsolidatedMessage([a, b], { today: TODAY }).message,
    buildConsolidatedMessage([b, a], { today: TODAY }).message,
  );

  const v1: BatchFragment = { hash: "ffff", section: "💎 特殊状況", body: "・XYZ 監視 https://a/1" };
  const v2: BatchFragment = { hash: "0001", section: "💎 特殊状況", body: "・XYZ  監視  https://b/2" };
  assert.equal(normalizeKey(v1.section, v1.body), normalizeKey(v2.section, v2.body));
  assert.equal(dedupeFragments([v1, v2]).representatives[0].hash, "0001");

  const long = "あ".repeat(200);
  const limited = buildConsolidatedMessage(
    [bf("💎 特殊状況", "A" + long), bf("💎 特殊状況", "B" + long), bf("💎 特殊状況", "C" + long)],
    { today: TODAY, maxChars: 400 },
  );
  assert.equal(limited.includedCount, 1);
  assert.equal(limited.omittedItemCount, 2);
  const included = new Set(limited.includedHashes);
  for (const hash of limited.omittedHashes) assert.ok(!included.has(hash));

  // 総fragmentが1件だけなら切り詰めて送る。
  const singleHuge = buildConsolidatedMessage(
    [bf("📊 銘柄スコア", "X".repeat(20000))],
    { today: TODAY, maxChars: 500 },
  );
  assert.ok(singleHuge.truncated);
  assert.ok(singleHuge.message && singleHuge.message.length <= 500);
  assert.equal(singleHuge.includedCount, 1);
  assert.deepEqual(singleHuge.oversizedHashes, []);

  // 巨大が先でも後続の小さいfragmentは救済する。
  const giant = bf("💎 特殊状況", "A" + "P".repeat(20000));
  const small = bf("💎 特殊状況", "Z-small-item");
  const mixed = buildConsolidatedMessage([giant, small], { today: TODAY, maxChars: 500 });
  assert.ok(mixed.message?.includes("Z-small-item"));
  assert.ok(mixed.includedHashes.includes(small.hash));
  assert.ok(mixed.oversizedHashes.includes(giant.hash));

  // 全件巨大なら省略案内だけを送らず、message=nullでpending維持。
  const allHuge = buildConsolidatedMessage(
    [bf("💎 特殊状況", "A" + "P".repeat(20000)), bf("💎 特殊状況", "B" + "Q".repeat(20000))],
    { today: TODAY, maxChars: 500 },
  );
  assert.equal(allHuge.message, null);
  assert.equal(allHuge.includedCount, 0);
  assert.equal(allHuge.oversizedHashes.length, 2);
  assert.equal(allHuge.omittedItemCount, 2);

  assert.ok(
    buildConsolidatedMessage([], { today: TODAY, immediateUrgentCount: 2 })
      .message?.includes("🚨 緊急 2 件は即時通知済み"),
  );
}

// =========================================================================
// B. transport / retry budget
// =========================================================================
{
  assert.equal(consumesRetryBudget("http-4xx"), true);
  assert.equal(consumesRetryBudget("network-error"), true);
  assert.equal(consumesRetryBudget("dry-run"), false);
  assert.equal(consumesRetryBudget("credentials-missing"), false);

  assert.ok(createTransport({} as NodeJS.ProcessEnv) instanceof MissingCredentialsTransport);
  assert.ok(
    createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y", NOTIFY_MODE: "off" } as NodeJS.ProcessEnv)
      instanceof DryRunTransport,
  );
  assert.equal(createTransport({ LINE_CHANNEL_TOKEN: "x", LINE_USER_ID: "y" } as NodeJS.ProcessEnv).mode, "real");

  const throwingFetch = (async () => { throw new Error("down secretTOK"); }) as unknown as typeof fetch;
  const network = await new LineApiTransport("secretTOK", "U", throwingFetch).send([]);
  assert.equal(network.outcome, "network-error");
  assert.ok(!(network.error ?? "").includes("secretTOK"));
  const redacted = redactSecrets("Bearer X to=Uabc", ["Uabc"]);
  assert.ok(redacted.includes("***REDACTED***") && !redacted.includes("Uabc"));
  assert.equal(SECTION_ORDER[0], "🚨 緊急開示");
}

// =========================================================================
// C. Ledger純関数・JST・構造検証
// =========================================================================
{
  const ledger = emptyLedger();
  ensureEntry(ledger, { hash: "h", section: "s", kind: "normal", now: NOW });
  assert.equal(ledger.entries.h.status, "queued");
  for (let i = 0; i < MAX_ATTEMPTS; i++) markFailed(ledger, ["h"], "e", NOW);
  assert.equal(ledger.entries.h.status, "failed");
  requeueFailed(ledger);
  assert.equal(ledger.entries.h.status, "queued");

  assert.equal(jstDateOf("2026-08-04T15:00:00.000Z"), "2026-08-05");
  assert.equal(jstDateOf("2026-08-04T23:59:00.000Z"), "2026-08-05");
  assert.equal(jstDateOf("2026-08-05T14:59:00.000Z"), "2026-08-05");
  assert.equal(jstDateOf("2026-08-04T14:59:00.000Z"), "2026-08-04");
  const urgent = emptyLedger();
  ensureEntry(urgent, { hash: "u", section: "s", kind: "urgent", now: NOW });
  markSent(urgent, ["u"], "2026-08-04T23:30:00.000Z");
  assert.equal(urgent.entries.u.deliveredDateJst, "2026-08-05");
  assert.equal(countUrgentDeliveredToday(urgent, "2026-08-05"), 1);
}

// JSONとして読めてもschema不正ならcorrupt。
withTempDir((dir) => {
  const hash = "0".repeat(16);
  const validEntry = {
    hash,
    section: "📊 銘柄スコア",
    kind: "normal",
    status: "queued",
    attempts: 0,
    queuedAt: NOW,
  };
  const invalidLedgers = [
    { version: 1, entries: [] },
    { version: 2, entries: {} },
    { version: 1, entries: { [hash]: { ...validEntry, hash: "1".repeat(16) } } },
    { version: 1, entries: { [hash]: { ...validEntry, kind: "mystery" } } },
    { version: 1, entries: { [hash]: { ...validEntry, status: "unknown" } } },
    { version: 1, entries: { [hash]: { ...validEntry, attempts: -1 } } },
  ];
  for (const payload of invalidLedgers) {
    writeFileSync(join(dir, ".ledger.json"), JSON.stringify(payload));
    assert.equal(readLedgerState(dir).status, "corrupt");
  }
});

// entries配列をenqueueで空ledgerへ置換せずblockする。
withTempDir((dir) => {
  writeFileSync(join(dir, ".ledger.json"), JSON.stringify({ version: 1, entries: [] }));
  const result = enqueueFragment(dir, { text: "🌅 Alpha Pon Morning Lite\narray-ledger", kind: "normal", now: NOW });
  assert.equal(result.action, "ledger-corrupt");
  assert.ok(isBlocked(dir));
  assert.ok(readEnvelope(dir, result.hash));
});

// =========================================================================
// D. Envelope / orphan / legacy
// =========================================================================
withTempDir((dir) => {
  const text = "🚨 Alpha Pon 緊急開示\n・1234 TOB";
  const hash = putEnvelope(dir, "urgent", "🚨 緊急開示", text);
  assert.equal(readEnvelope(dir, hash)?.kind, "urgent");
  assert.deepEqual(listEnvelopeHashes(dir), [hash]);

  const badHash = "deadbeefdeadbeef";
  writeFileSync(
    join(dir, "fragments", `${badHash}.fragment.json`),
    JSON.stringify({ version: 1, hash: badHash, kind: "normal", section: "s", text: "別内容", queuedAt: NOW }),
  );
  assert.equal(readEnvelope(dir, badHash), null);
  writeFileSync(join(dir, "fragments", `${"a".repeat(16)}.fragment.json`), "{ broken");
  assert.equal(readEnvelope(dir, "a".repeat(16)), null);
});

withTempDir((dir) => {
  const hNormal = putEnvelope(dir, "normal", "📊 銘柄スコア", "🌅 Alpha Pon Morning Lite\n1. 7203 62点");
  const hScoreUrgent = putEnvelope(dir, "urgent", "🚨 緊急開示", "🚨 7203 トヨタ 88点\n  区分: 事実");
  const hTdnet = putEnvelope(dir, "urgent", "🚨 緊急開示", "🚨 Alpha Pon 緊急開示\n・1234 TOB");
  const ledger = reconcileOrphanFragments(dir, emptyLedger(), NOW);
  assert.equal(ledger.entries[hNormal].kind, "normal");
  assert.equal(ledger.entries[hScoreUrgent].kind, "urgent");
  assert.equal(ledger.entries[hTdnet].kind, "urgent");
  assert.deepEqual(
    loadPendingFragments(dir, ledger, "urgent").map((f) => f.hash).sort(),
    [hScoreUrgent, hTdnet].sort(),
  );
});

withTempDir((dir) => {
  mkdirSync(join(dir, "fragments"), { recursive: true });
  writeFileSync(join(dir, "fragments", `${"b".repeat(16)}.fragment.json`), "{ broken json");
  const ledger = reconcileOrphanFragments(dir, emptyLedger(), NOW);
  assert.deepEqual(Object.keys(ledger.entries), []);
  assert.ok(findLedgerAnomalies(dir, ledger).malformedEnvelopes.length >= 1);
});

withTempDir((dir) => {
  const ambiguousText = "🚨 7203 トヨタ 88点";
  const ambiguousHash = contentHash(ambiguousText);
  writeFileSync(join(dir, `${ambiguousHash}.txt`), ambiguousText);
  const tdnetText = "🚨 Alpha Pon 緊急開示\n・9999 上場廃止";
  const tdnetHash = contentHash(tdnetText);
  writeFileSync(join(dir, `${tdnetHash}.txt`), tdnetText);
  const ledger = reconcileOrphanFragments(dir, emptyLedger(), NOW);
  assert.equal(ledger.entries[ambiguousHash], undefined);
  assert.equal(ledger.entries[tdnetHash]?.kind, "urgent");
  assert.ok(findLedgerAnomalies(dir, ledger).ambiguousLegacy.includes(ambiguousHash));

  const normalText = "🌅 Alpha Pon Morning Lite\n本文";
  const normalHash = contentHash(normalText);
  writeFileSync(join(dir, `${normalHash}.txt`), normalText);
  const existing = emptyLedger();
  ensureEntry(existing, { hash: normalHash, section: "📊 銘柄スコア", kind: "normal", now: NOW });
  reconcileOrphanFragments(dir, existing, NOW);
  assert.equal(readEnvelope(dir, normalHash)?.kind, "normal");
});

// =========================================================================
// E. enqueue / block marker
// =========================================================================
withTempDir((dir) => {
  const { hash, action } = enqueueFragment(dir, { text: "🌅 Alpha Pon Morning Lite\nT", kind: "normal", now: NOW });
  assert.equal(action, "added");
  assert.equal(loadLedger(dir).entries[hash].status, "queued");
  assert.equal(readEnvelope(dir, hash)?.kind, "normal");
});

withTempDir((dir) => {
  writeFileSync(join(dir, ".ledger.json"), "{ not json");
  const { hash, action } = enqueueFragment(dir, { text: "🌅 Alpha Pon Morning Lite\nX", kind: "normal", now: NOW });
  assert.equal(action, "ledger-corrupt");
  assert.ok(readEnvelope(dir, hash));
  assert.ok(isBlocked(dir));
  assert.equal(readBlockMarker(dir)?.reason, "ledger-corrupt");
  assert.ok(!existsSync(join(dir, ".ledger.json")));
});

await withTempDir(async (dir) => {
  writeFileSync(join(dir, ".ledger.json"), "broken{");
  const transport = fakeTransport("real", OK);
  const text = "🚨 Alpha Pon 緊急開示\n・1234 TOB";
  const result = await deliverUrgent(dir, transport, { text, section: "🚨 緊急開示", messages: [{ type: "text", text }] });
  assert.equal(result.outcome, "ledger-corrupt");
  assert.equal(transport.calls, 0);
  assert.equal(readEnvelope(dir, contentHash(text))?.kind, "urgent");
  assert.ok(isBlocked(dir));
});

await withTempDir(async (dir) => {
  writeFileSync(join(dir, ".ledger-blocked.json"), JSON.stringify({ reason: "ledger-corrupt", detectedAt: NOW }));
  const enqueued = enqueueFragment(dir, { text: "🌅 x\nbody", kind: "normal", now: NOW });
  assert.equal(enqueued.action, "ledger-blocked");
  assert.ok(readEnvelope(dir, enqueued.hash));
  const transport = fakeTransport("real", OK);
  const text = "🚨 Alpha Pon 緊急開示\n・1 TOB";
  const result = await deliverUrgent(dir, transport, { text, messages: [{ type: "text", text }] });
  assert.equal(result.outcome, "ledger-blocked");
  assert.equal(transport.calls, 0);
  clearBlockMarker(dir);
  assert.equal(isBlocked(dir), false);
});

// =========================================================================
// F. deliverUrgent: 送信前durability / retry / dedupe
// =========================================================================
await withTempDir(async (dir) => {
  const text = "🚨 PRE-SEND";
  const hash = contentHash(text);
  let inspected = false;
  const transport: LineTransport = {
    mode: "real",
    async send() {
      inspected = true;
      assert.equal(readEnvelope(dir, hash)?.kind, "urgent", "transport前にenvelopeが存在する");
      const state = readLedgerState(dir);
      assert.equal(state.status, "ok");
      assert.equal(state.ledger.entries[hash]?.status, "queued", "transport前にqueued ledgerが存在する");
      return OK;
    },
  };
  const result = await deliverUrgent(dir, transport, { text, messages: [{ type: "text", text }] });
  assert.ok(inspected);
  assert.equal(result.outcome, "sent");
  assert.equal(readEnvelope(dir, hash), null);
  assert.equal(loadLedger(dir).entries[hash].status, "sent");
});

// transportがthrowしても送信前状態が残る。
await withTempDir(async (dir) => {
  const text = "🚨 THROW-AFTER-PERSIST";
  const hash = contentHash(text);
  const transport: LineTransport = {
    mode: "real",
    async send() {
      assert.equal(readEnvelope(dir, hash)?.kind, "urgent");
      assert.equal(loadLedger(dir).entries[hash]?.status, "queued");
      throw new Error("simulated crash");
    },
  };
  await assert.rejects(deliverUrgent(dir, transport, { text, messages: [{ type: "text", text }] }));
  assert.equal(readEnvelope(dir, hash)?.kind, "urgent");
  assert.equal(loadLedger(dir).entries[hash].status, "queued");
});

await withTempDir(async (dir) => {
  const transport = fakeTransport("dry-run", DRY);
  for (let i = 0; i < 3; i++) {
    assert.equal(
      (await deliverUrgent(dir, transport, { text: "🚨 U1", messages: [{ type: "text", text: "🚨 U1" }] })).outcome,
      "dry-run",
    );
  }
  const hash = contentHash("🚨 U1");
  assert.equal(loadLedger(dir).entries[hash].attempts, 0);
  assert.equal(readEnvelope(dir, hash)?.kind, "urgent");
});

await withTempDir(async (dir) => {
  const noCredentials = fakeTransport("real", NOCRED);
  for (let i = 0; i < 6; i++) {
    assert.equal(
      (await deliverUrgent(dir, noCredentials, { text: "🚨 U2", messages: [{ type: "text", text: "🚨 U2" }] })).outcome,
      "credentials-missing",
    );
  }
  const hash = contentHash("🚨 U2");
  assert.equal(loadLedger(dir).entries[hash].attempts, 0);
  const ok = fakeTransport("real", OK);
  assert.equal((await deliverUrgent(dir, ok, { text: "🚨 U2", messages: [{ type: "text", text: "🚨 U2" }] })).outcome, "sent");
  assert.equal((await deliverUrgent(dir, ok, { text: "🚨 U2", messages: [{ type: "text", text: "🚨 U2" }] })).outcome, "skipped-already-sent");
  assert.equal(ok.calls, 1);
  assert.equal(readEnvelope(dir, hash), null);
});

await withTempDir(async (dir) => {
  const first = fakeTransport("real", OK);
  const text = "🚨 Alpha Pon 緊急開示\n・1234 TOB";
  assert.equal((await deliverUrgent(dir, first, { text, messages: [{ type: "text", text }] })).outcome, "sent");
  const second = fakeTransport("real", OK);
  assert.equal((await deliverUrgent(dir, second, { text, messages: [{ type: "text", text }] })).outcome, "skipped-already-sent");
  assert.equal(first.calls + second.calls, 1);
});

await withTempDir(async (dir) => {
  const text = "🚨 U3";
  const hash = contentHash(text);
  assert.equal((await deliverUrgent(dir, fakeTransport("real", HTTP4), { text, messages: [{ type: "text", text }] })).outcome, "http-4xx");
  assert.equal(loadLedger(dir).entries[hash].status, "pending-retry");
  assert.equal((await deliverUrgent(dir, fakeTransport("real", OK), { text, messages: [{ type: "text", text }] })).outcome, "sent");
  assert.equal(Object.keys(loadLedger(dir).entries).length, 1);

  const text2 = "🚨 U4";
  assert.equal((await deliverUrgent(dir, fakeTransport("real", NET), { text: text2, messages: [{ type: "text", text: text2 }] })).outcome, "network-error");
  assert.equal(loadLedger(dir).entries[contentHash(text2)].status, "pending-retry");
});

await withTempDir(async (dir) => {
  const text = "🚨 U5";
  const hash = contentHash(text);
  enqueueFragment(dir, { text, kind: "urgent", now: NOW });
  const ledger = loadLedger(dir);
  for (let i = 0; i < MAX_ATTEMPTS; i++) markFailed(ledger, [hash], "e", NOW);
  saveLedger(dir, ledger);
  const transport = fakeTransport("real", OK);
  assert.equal((await deliverUrgent(dir, transport, { text, messages: [{ type: "text", text }] })).outcome, "failed-max-attempts");
  assert.equal(transport.calls, 0);
});

await withTempDir(async (dir) => {
  const previous = process.env.LINE_BATCH_DIR;
  process.env.LINE_BATCH_DIR = dir;
  try {
    writeFileSync(join(dir, ".ledger.json"), "corrupt{{");
    const text = "🚨 Alpha Pon 緊急開示\n・5678 MBO";
    await assert.doesNotReject(sendUrgentDisclosure(text));
    assert.ok(isBlocked(dir));
    assert.equal(readEnvelope(dir, contentHash(text))?.kind, "urgent");
  } finally {
    if (previous === undefined) delete process.env.LINE_BATCH_DIR;
    else process.env.LINE_BATCH_DIR = previous;
  }
});

// =========================================================================
// G. pipeline lock: token ownership / stale / signal終了
// =========================================================================
{
  const lockScript = (body: string) =>
    execSync(`bash -c 'set -u; source "${REPO}/scripts/pipeline-lock.sh"; ${body}'`, { encoding: "utf-8" });

  {
    const lock = mkdtempSync(join(tmpdir(), "lockp-")) + "/lock.d";
    const out = lockScript(
      `Lk="${lock}"; pl_acquire "$Lk" && echo A1_OK; ( pl_acquire "$Lk" && echo A2_GOT || echo A2_SKIP ); pl_release; pl_acquire "$Lk" && echo A3_OK; pl_release`,
    );
    assert.ok(out.includes("A1_OK"));
    assert.ok(out.includes("A2_SKIP"));
    assert.ok(out.includes("A3_OK"));
    rmSync(lock.replace(/\/lock\.d$/, ""), { recursive: true, force: true });
  }

  // live PID + tokenは奪わない。
  {
    const base = mkdtempSync(join(tmpdir(), "lockl-"));
    const lock = join(base, "lock.d");
    const out = lockScript(
      `Lk="${lock}"; mkdir "$Lk"; echo $$ > "$Lk/pid"; echo live-token > "$Lk/token"; pl_acquire "$Lk" && echo GOT || echo BLOCKED`,
    );
    assert.ok(out.includes("BLOCKED"));
    rmSync(base, { recursive: true, force: true });
  }

  // PID/token欠落の初期化途中lockはstaleと決めつけず奪わない。
  {
    const base = mkdtempSync(join(tmpdir(), "locki-"));
    const lock = join(base, "lock.d");
    const out = lockScript(
      `Lk="${lock}"; mkdir "$Lk"; pl_acquire "$Lk" && echo GOT || echo BLOCKED; test -d "$Lk" && echo PRESERVED`,
    );
    assert.ok(out.includes("BLOCKED"));
    assert.ok(out.includes("PRESERVED"));
    rmSync(base, { recursive: true, force: true });
  }

  // 有効なtokenを持つ死亡PIDだけstale退避して再取得。
  {
    const base = mkdtempSync(join(tmpdir(), "locks-"));
    const lock = join(base, "lock.d");
    const out = lockScript(
      `Lk="${lock}"; mkdir "$Lk"; echo 999999 > "$Lk/pid"; echo stale-token > "$Lk/token"; echo 2026-08-05T00:00:00Z > "$Lk/started_at"; pl_acquire "$Lk" && echo REACQUIRED || echo STILL_LOCKED; pl_release`,
    );
    assert.ok(out.includes("REACQUIRED"));
    rmSync(base, { recursive: true, force: true });
  }

  // tokenが入れ替わっていたら他ownerのlockを削除しない。
  {
    const base = mkdtempSync(join(tmpdir(), "lockt-"));
    const lock = join(base, "lock.d");
    const out = lockScript(
      `Lk="${lock}"; pl_acquire "$Lk"; echo replacement-token > "$Lk/token"; pl_release; test -d "$Lk" && echo PRESERVED`,
    );
    assert.ok(out.includes("PRESERVED"));
    rmSync(base, { recursive: true, force: true });
  }

  // TERM後はlockを解放してexit 143。後続処理を実行しない。
  {
    const base = mkdtempSync(join(tmpdir(), "locksig-"));
    const lock = join(base, "lock.d");
    const script = [
      "set -u",
      `source "${REPO}/scripts/pipeline-lock.sh"`,
      `pl_acquire "${lock}"`,
      "trap 'pl_release' EXIT",
      "trap 'pl_exit_on_signal 143' TERM",
      "( sleep 0.05; kill -TERM $$ ) &",
      "sleep 1",
      "echo AFTER_SIGNAL",
    ].join("; ");
    const result = spawnSync("bash", ["-c", script], { encoding: "utf-8" });
    assert.equal(result.status, 143);
    assert.ok(!result.stdout.includes("AFTER_SIGNAL"));
    assert.ok(!existsSync(lock));
    rmSync(base, { recursive: true, force: true });
  }
}

// =========================================================================
// H. 配線
// =========================================================================
{
  const emergency = readFileSync(new URL("../src/emergency-disclosure-watch.ts", import.meta.url), "utf-8");
  assert.ok(emergency.includes("sendUrgentDisclosure") && !emergency.includes("sendPipelineSummaryNotification"));
  const notify = readFileSync(new URL("../src/notify.ts", import.meta.url), "utf-8");
  assert.ok(notify.includes("safeDeliverUrgent"));
  assert.ok(!/\bpushLine\(/.test(notify));
  const complete = readFileSync(new URL("../scripts/run-daily-complete.sh", import.meta.url), "utf-8");
  assert.ok(complete.includes("pl_acquire") && complete.includes("skipped_locked"));
  assert.ok(complete.includes("pl_exit_on_signal 130") && complete.includes("pl_exit_on_signal 143"));
}

console.log("line-consolidation.test.ts: all assertions passed");
