// research:holdout:open を合成データで端から端まで通すテスト。
//
// 本物の封印は1回しか開けられないので、実行の経路（--execute）は実データで試せない。
// 一時ディレクトリに保存庫・封印・事前登録（git にコミット）を作って確かめる。
//
// 守りたい性質:
//   1. 引数だけなら計画の表示だけで、記録を残さない
//   2. --execute で1回だけ実行し、スキーマに合う記録を1行残す
//   3. 同じ Edge は2回目を拒否する
//   4. 事前登録が変更中なら拒否する
//   5. 開示イベントスタディ（kind = disclosure_event_study）も同じ入口で1回だけ走り、
//      続報・重複・価格なし・決算日を落として、コスト前の記録を残す

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadSchema } from "../../src/research/io.js";
import { validate } from "../../src/research/schema.js";
import { toEquityMasterRecord } from "../../src/research/providers/jquants-master-store.js";
import { toFinsDisclosureRecord } from "../../src/research/providers/jquants-fins-store.js";

const REPO = resolve(import.meta.dirname, "../..");
const CLI = join(REPO, "src/research/cli/holdout-open.ts");
const dir = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-holdout-open-"));

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function git(args: string[]): void {
  const result = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], {
    cwd: dir, encoding: "utf-8",
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
}

function runCli(
  extra: string[],
  target: { bundle: string; prereg: string; tradingDays?: number; until?: string; edgeId?: string } = {
    bundle: "research/studies/short.json", prereg: "docs/prereg.md", tradingDays: 40,
  },
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [
    "--import", "tsx/esm", CLI,
    `--bundle=${target.bundle}`,
    `--prereg=${target.prereg}`,
    "--from=2025-08-01",
    ...(target.tradingDays === undefined ? [] : [`--trading-days=${target.tradingDays}`]),
    ...(target.until === undefined ? [] : [`--until=${target.until}`]),
    ...(target.edgeId === undefined ? [] : [`--edge-id=${target.edgeId}`]),
    "--min-t=1.96",
    "--min-clusters=2",
    "--actor=test",
    ...extra,
  ], { cwd: dir, encoding: "utf-8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

try {
  // --- 保存庫を組む ---------------------------------------------------------
  for (const sub of ["prices/jquants-free-daily", "fins/jquants-free-daily", "master/jquants-free-daily", "holdout", "studies"]) {
    mkdirSync(join(dir, "research", sub), { recursive: true });
  }
  mkdirSync(join(dir, "data/disclosures"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  // スキーマの読み込みはリンクを受け付けない（standalone regular file のみ）。複製する。
  cpSync(join(REPO, "research/schemas"), join(dir, "research/schemas"), { recursive: true });
  symlinkSync(join(REPO, "node_modules"), join(dir, "node_modules"));

  const dates = weekdays("2025-01-06", "2025-10-31");
  // 実データと同じ5桁（TDnet の4桁コードは末尾0を補って突き合わせる）。
  const codes = Array.from({ length: 110 }, (_, index) => `${1001 + index}0`);
  // 確認期間（2025-08-01 以降）に 10 銘柄が個別に急落し、その後も下げる。
  const confirmDates = dates.filter((date) => date >= "2025-08-01");
  const crashDayByCode = new Map(codes.slice(0, 10).map((code, index) => [code, confirmDates[3 + index * 3]!]));
  const random = lcg(7);
  const closes = new Map(codes.map((code) => [code, 1000]));
  const fileLines = new Map<string, string[]>(dates.map((date) => [date, []]));
  const downDays = new Map<string, number>();
  for (const date of dates) {
    const market = (random() - 0.5) * 0.02;
    for (const code of codes) {
      const previous = closes.get(code)!;
      let move = market + (random() - 0.5) * 0.01;
      let open = previous;
      if (crashDayByCode.get(code) === date) {
        move = -0.15;
        downDays.set(code, 5);
      } else if ((downDays.get(code) ?? 0) > 0) {
        move = market - 0.01;
        downDays.set(code, downDays.get(code)! - 1);
      }
      const close = Math.round(previous * (1 + move) * 100) / 100;
      if (crashDayByCode.get(code) === date) open = close;
      closes.set(code, close);
      const stamp = `${date}T15:30:00+09:00`;
      fileLines.get(date)!.push(JSON.stringify({
        schemaVersion: 1, seriesKind: "security", code, market: "TSE", tradingDate: date,
        dataAsOf: stamp, observedAt: stamp, retrievedAt: stamp, firstExecutableAt: stamp,
        source: "synthetic", sourceVersion: "synthetic-v1", providerPlan: "synthetic",
        delayDays: 0, isDelayed: false, ingestionRunId: "synthetic", currency: "JPY", status: "traded",
        ohlcv: { open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1_000_000 },
        adjusted: false, adjustmentFactor: 1, corporateActions: [], license: "local_only",
      }));
    }
  }
  for (const [date, lines] of fileLines) {
    writeFileSync(join(dir, "research/prices/jquants-free-daily", `${date}.jsonl`), `${lines.join("\n")}\n`);
  }
  writeFileSync(join(dir, "research/prices/jquants-free-daily/_adjustments.jsonl"), "");

  writeFileSync(join(dir, "research/fins/jquants-free-daily/2025-01-06.jsonl"), `${JSON.stringify(toFinsDisclosureRecord({
    queryDate: "2025-01-06",
    raw: { DiscDate: "2025-01-06", DiscTime: "15:30:00", Code: "11100", DiscNo: "1", DocType: "3QFinancialStatements_Consolidated_JP" },
    retrievedAt: "2025-04-01T00:00:00.000Z",
    ingestionRunId: "synthetic",
  }))}\n`);

  // 10010 だけ信用銘柄（売れない）。
  writeFileSync(join(dir, "research/master/jquants-free-daily/2025-01-06.jsonl"), `${codes.map((code) => JSON.stringify(toEquityMasterRecord({
    queryDate: "2025-01-06",
    raw: {
      Date: "2025-01-06", Code: code, CoName: `会社${code}`, S17: "1", S33: "3050", S33Nm: "食料品",
      ScaleCat: "TOPIX Small 1", Mkt: "0111", Mrgn: code === "10010" ? "1" : "2",
    },
    retrievedAt: "2025-04-01T00:00:00.000Z",
    ingestionRunId: "synthetic",
  }))).join("\n")}\n`);

  writeFileSync(join(dir, "research/holdout/vault.manifest.json"), JSON.stringify({
    schemaVersion: 1,
    sealedAt: "2025-06-01",
    policy: "test",
    windows: [{ id: "vault-test", from: "2025-07-01", to: "2025-12-31", scope: "all_universe" }],
  }));
  writeFileSync(join(dir, "research/holdout/access_log.jsonl"), "");

  writeFileSync(join(dir, "research/studies/short.json"), JSON.stringify({
    spec: {
      schemaVersion: 1, id: "synthetic-short-d5", edgeId: "synthetic-reversal", side: "short",
      notionalJpy: 1_000_000, entry: { mode: "next_open" },
      exit: { mode: "holding_period", holdingPeriodDays: 5 },
      costs: { commissionBps: 5, spreadBps: 10, slippageBps: 8, marketImpactBpsPerPctAdv: 10, borrowCostAnnualBps: 1825 },
      liquidity: { participationLimitPct: 3, minAdtvJpy: 500_000_000, minHistoryBars: 20, maxLots: 50, lotSize: 100 },
      benchmark: "UNIVERSE-EW",
    },
    detector: {
      kind: "abnormal_move",
      params: {
        abnormalReturnThresholdPct: -10,
        knownEventDates: {},
        marketModel: { estimationBars: 120, gapBars: 5, minObservations: 60, maxPriorGapDays: 10 },
        minAverageTurnoverJpy: 500_000_000,
      },
    },
    filters: { lendableOnly: true },
    trials: 1,
  }, null, 2));

  writeFileSync(join(dir, "docs/prereg.md"),
    "- edgeId: `synthetic-reversal`\nbundle: `research/studies/short.json`\n"
    + "確認: 2025-08-01 以降の 40 営業日で1回だけ。t ≥ 1.96、最小クラスタ 2\n");
  // 同じ bundle・同じ規則を、別の標本で確かめる事前登録（過去側の確認と同じ形）。
  // edgeId を分けないと、先に実行したほうがもう一方を永久に塞ぐ。
  writeFileSync(join(dir, "docs/prereg-backward.md"),
    "- edgeId: `synthetic-reversal-backward`（売買の規則は `synthetic-reversal` と同一）\n"
    + "bundle: `research/studies/short.json`\n"
    + "確認: 2025-08-01 〜 2025-09-10 まで1回だけ。t ≥ 1.96、最小クラスタ 2\n");

  // --- 開示イベントスタディの材料 -------------------------------------------
  const crashDay = (index: number) => crashDayByCode.get(codes[index]!)!;
  const previousTradingDay = (date: string) => dates[dates.indexOf(date) - 1]!;
  const tdnet = (date: string, time: string, code4: string, title: string) => JSON.stringify({
    schemaVersion: 1, observationDate: date, status: "published", code: code4, sourceCode: `${code4}0`,
    companyName: `会社${code4}`, title, publishedAt: `${date}T${time}+09:00`,
    url: "https://www.release.tdnet.info/inbs/synthetic.pdf", retrievedAt: "2025-09-01T00:00:00.000Z", contentHash: "x",
  });
  const disclosureRows = [
    tdnet(crashDay(1), "12:00:00", "1002", "当社における不適切な会計処理に関するお知らせ"),
    tdnet(dates[dates.indexOf(crashDay(1)) + 7]!, "12:00:00", "1002", "第三者委員会設置のお知らせ"), // 重複
    tdnet(crashDay(2), "12:00:00", "1003", "不正アクセスに関するお知らせ"), // 決算日と重なる
    tdnet(crashDay(3), "12:00:00", "1004", "不正アクセスに関するお知らせ（第２報）"), // 続報
    tdnet(previousTradingDay(crashDay(4)), "17:00:00", "1005", "調査委員会設置に関するお知らせ"), // 引け後 → 翌日
    tdnet(crashDay(0), "12:00:00", "9999", "不適切な取引について"), // 価格なし
    tdnet(crashDay(0), "12:00:00", "1006", "自己株式の取得に関するお知らせ"), // キーワードなし
  ];
  const disclosureByDate = new Map<string, string[]>();
  for (const line of disclosureRows) {
    const date = JSON.parse(line).observationDate as string;
    disclosureByDate.set(date, [...(disclosureByDate.get(date) ?? []), line]);
  }
  for (const [date, lines] of disclosureByDate) {
    writeFileSync(join(dir, "data/disclosures", `${date}.jsonl`), `${lines.join("\n")}\n`);
  }
  // 10030 は同じ日の昼に決算を出している（決算日として除外される）。
  writeFileSync(join(dir, "research/fins/jquants-free-daily", `${crashDay(2)}.jsonl`), `${JSON.stringify(toFinsDisclosureRecord({
    queryDate: crashDay(2),
    raw: { DiscDate: crashDay(2), DiscTime: "12:30:00", Code: "10030", DiscNo: "2", DocType: "1QFinancialStatements_Consolidated_JP" },
    retrievedAt: "2025-09-01T00:00:00.000Z",
    ingestionRunId: "synthetic",
  }))}\n`);
  writeFileSync(join(dir, "research/studies/misconduct.json"), JSON.stringify({
    kind: "disclosure_event_study",
    schemaVersion: 1,
    edgeId: "synthetic-misconduct",
    specId: "synthetic-misconduct-v1",
    population: {
      source: "tdnet_archive",
      eventFrom: "2025-08-01",
      eventTo: "2025-08-29",
      keywords: ["第三者委員会", "調査委員会", "不正アクセス", "不適切"],
      followUpMarkers: ["報告書", "第２報", "経過"],
      dedupeCalendarDays: 120,
    },
    minAverageTurnoverJpy: 100_000_000,
    excludeKnownEarnings: true,
    horizons: [1, 5, 20],
    primaryHorizon: 5,
    twoSided: true,
  }, null, 2));
  // 期間の終わりを日付で決める場（過去側の確認と同じ形）。Edge が違うので別に開ける。
  const shortBundle = JSON.parse(readFileSync(join(dir, "research/studies/short.json"), "utf-8"));
  writeFileSync(join(dir, "research/studies/until.json"), JSON.stringify({
    ...shortBundle,
    spec: { ...shortBundle.spec, id: "synthetic-until-d5", edgeId: "synthetic-until" },
  }, null, 2));
  writeFileSync(join(dir, "docs/prereg-until.md"),
    "- edgeId: `synthetic-until`\nbundle: `research/studies/until.json`\n確認: 2025-08-01 〜 2025-09-10 まで1回だけ。t ≥ 1.96、最小クラスタ 2\n");
  // 取り込みが終了日まで届いていない場（合成の保存庫は 2025-10-31 まで）。
  writeFileSync(join(dir, "research/studies/until-late.json"), JSON.stringify({
    ...shortBundle,
    spec: { ...shortBundle.spec, id: "synthetic-until-late-d5", edgeId: "synthetic-until-late" },
  }, null, 2));
  writeFileSync(join(dir, "docs/prereg-until-late.md"),
    "- edgeId: `synthetic-until-late`\nbundle: `research/studies/until-late.json`\n確認: 2025-08-01 〜 2025-11-28 まで1回だけ。t ≥ 1.96、最小クラスタ 2\n");
  writeFileSync(join(dir, "docs/prereg-misconduct.md"),
    "- edgeId: `synthetic-misconduct`\nbundle: `research/studies/misconduct.json`\n確認: 2025-08-01 以降の 45 営業日で1回だけ。|t| ≥ 1.96、最小クラスタ 2\n");
  git(["init", "-q"]);
  git(["add", "docs/prereg.md", "docs/prereg-misconduct.md", "docs/prereg-until.md", "docs/prereg-until-late.md",
    "docs/prereg-backward.md"]);
  git(["commit", "-q", "-m", "prereg"]);

  const accessLogPath = join(dir, "research/holdout/access_log.jsonl");

  // 1. 計画の表示だけ
  const plan = runCli([]);
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /確認期間: 2025-08-01 〜 2025-09-25（40営業日） \/ 封印の窓 vault-test/);
  assert.match(plan.stdout, /計画だけ表示しました/);
  assert.equal(readFileSync(accessLogPath, "utf-8"), "", "計画の表示では記録を残さない");

  // 2. 1回だけ実行
  const run = runCli(["--execute"]);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /貸借  : シグナル \d+ → \d+（貸借でない 1 \/ 区分不明 0）/, "信用銘柄 10010 は売らない");
  const lines = readFileSync(accessLogPath, "utf-8").trim().split("\n");
  assert.equal(lines.length, 1, "封印の窓1つにつき1行");
  const entry = JSON.parse(lines[0]!);
  assert.deepEqual(validate(entry, loadSchema("holdout-access")), []);
  assert.equal(entry.edgeId, "synthetic-reversal");
  assert.equal(entry.windowId, "vault-test");
  assert.equal(entry.actor, "test");
  assert.ok(entry.sampleCount > 0, "確認期間で約定している");
  const notes = JSON.parse(entry.notes);
  assert.equal(notes.from, "2025-08-01");
  assert.equal(notes.to, "2025-09-25");
  assert.equal(notes.tradingDays, 40);
  assert.equal(notes.specId, "synthetic-short-d5");
  assert.match(notes.preregCommit, /^[0-9a-f]{40}$/);
  assert.match(run.stdout, new RegExp(`判定    : ${entry.result.toUpperCase()}`));

  // 3. 2回目は拒否
  const again = runCli(["--execute"]);
  assert.notEqual(again.status, 0);
  assert.match(again.stdout + again.stderr, /開封済み/);
  assert.equal(readFileSync(accessLogPath, "utf-8").trim().split("\n").length, 1, "記録は増えない");

  // 4. 同じ bundle・別の標本（edgeId を分ければ塞がれない。分けなければ塞がれる）
  const backward = {
    bundle: "research/studies/short.json", prereg: "docs/prereg-backward.md",
    until: "2025-09-10", edgeId: "synthetic-reversal-backward",
  };
  const notDeclared = runCli([], { ...backward, prereg: "docs/prereg.md", until: undefined, tradingDays: 40 });
  assert.notEqual(notDeclared.status, 0, "事前登録が名乗っていない edgeId では開けない");
  assert.match(notDeclared.stdout + notDeclared.stderr, /edgeId synthetic-reversal-backward/);
  const wrongBundleEdge = runCli([], { ...backward, edgeId: undefined });
  assert.notEqual(wrongBundleEdge.status, 0, "bundle の edgeId のままでは、この事前登録と合わない");
  assert.match(
    wrongBundleEdge.stdout + wrongBundleEdge.stderr,
    /edgeId synthetic-reversal(?!-)/,
    "別の標本の事前登録を、開封済みの Edge のまま使うことはできない（1 Edge 1回を迂回できない）",
  );
  const backwardPlan = runCli([], backward);
  assert.equal(backwardPlan.status, 0, backwardPlan.stderr);
  assert.match(
    backwardPlan.stdout,
    /Edge    : synthetic-reversal-backward（spec synthetic-short-d5 \/ backtest・short \/ bundle の edgeId は synthetic-reversal）/,
  );
  const backwardRun = runCli(["--execute"], backward);
  assert.equal(backwardRun.status, 0, `${backwardRun.stdout}\n${backwardRun.stderr}`);
  const backwardLines = readFileSync(accessLogPath, "utf-8").trim().split("\n");
  assert.equal(backwardLines.length, 2, "別の Edge として2行目に記録される");
  const backwardEntry = JSON.parse(backwardLines[1]!);
  assert.deepEqual(validate(backwardEntry, loadSchema("holdout-access")), []);
  assert.equal(backwardEntry.edgeId, "synthetic-reversal-backward");
  assert.equal(JSON.parse(backwardEntry.notes).bundleEdgeId, "synthetic-reversal", "元の edgeId も残す");
  const backwardAgain = runCli(["--execute"], backward);
  assert.notEqual(backwardAgain.status, 0, "分けた Edge も1回だけ");
  assert.match(backwardAgain.stdout + backwardAgain.stderr, /開封済み/);

  // 5. 開示イベントスタディ
  const eventTarget = { bundle: "research/studies/misconduct.json", prereg: "docs/prereg-misconduct.md", tradingDays: 45 };
  const eventPlan = runCli([], eventTarget);
  assert.equal(eventPlan.status, 0, eventPlan.stderr);
  assert.match(eventPlan.stdout, /イベントスタディ・両側・主要 D\+5/);
  assert.match(eventPlan.stdout, /計画だけ表示しました/);
  const eventRun = runCli(["--execute"], eventTarget);
  assert.equal(eventRun.status, 0, `${eventRun.stdout}\n${eventRun.stderr}`);
  assert.match(eventRun.stdout, /母集団: 開示 7 → イベント 4（.*no_keyword=1.*follow_up=1.*duplicate_within_window=1/);
  assert.match(eventRun.stdout, /測定  : 2件（価格なし 1 \/ 反応日に足なし 0 \/ 売買代金不足 0 \/ 決算日 1）/);
  assert.match(eventRun.stdout, /売買の合否ではない/);
  const eventLines = readFileSync(accessLogPath, "utf-8").trim().split("\n");
  assert.equal(eventLines.length, 3, "別の Edge なので3行目として記録される");
  const eventEntry = JSON.parse(eventLines[2]!);
  assert.deepEqual(validate(eventEntry, loadSchema("holdout-access")), []);
  assert.equal(eventEntry.edgeId, "synthetic-misconduct");
  assert.equal("netAlphaBps" in eventEntry, false, "コスト前なので Net を名乗らない");
  assert.equal(eventEntry.sampleCount, 2);
  const eventNotes = JSON.parse(eventEntry.notes);
  assert.equal(eventNotes.kind, "disclosure_event_study");
  assert.equal(eventNotes.costs, "not_deducted");
  assert.equal(eventNotes.eventCount, 4);
  assert.equal(eventNotes.measurementRejected.known_earnings, 1);
  assert.ok(eventNotes.placebo.subjectCount > 0, "零点も記録する");
  assert.deepEqual(eventNotes.horizons.map((row: { horizon: number }) => row.horizon), [1, 5, 20]);
  const eventAgain = runCli(["--execute"], eventTarget);
  assert.notEqual(eventAgain.status, 0);
  assert.match(eventAgain.stdout + eventAgain.stderr, /開封済み/);

  // 6. 終わりを日付で決める指定（--until）
  const untilTarget = { bundle: "research/studies/until.json", prereg: "docs/prereg-until.md", until: "2025-09-10" };
  const untilPlan = runCli([], untilTarget);
  assert.equal(untilPlan.status, 0, untilPlan.stderr);
  assert.match(untilPlan.stdout, /確認期間: 2025-08-01 〜 2025-09-10（2025-09-10 まで・取り込み済み \d+営業日）/);
  const notIngested = runCli([], {
    bundle: "research/studies/until-late.json", prereg: "docs/prereg-until-late.md", until: "2025-11-28",
  });
  assert.equal(notIngested.status, 0, notIngested.stderr);
  assert.match(notIngested.stdout, /まだ開けません: 取り込みが 2025-11-28 まで届いていません（最終 2025-10-31）/);
  const mismatched = runCli([], { ...untilTarget, until: "2025-12-31" });
  assert.notEqual(mismatched.status, 0, "事前登録に無い終了日は通さない");
  assert.match(mismatched.stdout + mismatched.stderr, /終了日 2025-12-31/);
  const bothModes = runCli(["--trading-days=10"], untilTarget);
  assert.notEqual(bothModes.status, 0, "営業日数と終了日の両方は通さない");
  assert.match(bothModes.stdout + bothModes.stderr, /どちらか一方/);

  // 7. 事前登録が変更中なら拒否（計画の表示でも）
  writeFileSync(join(dir, "docs/prereg.md"), "書き換え中\n");
  const dirty = runCli([]);
  assert.notEqual(dirty.status, 0);
  assert.match(dirty.stdout + dirty.stderr, /未コミットの変更/);

  console.log("research/holdout-open-cli: 全テスト成功");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
