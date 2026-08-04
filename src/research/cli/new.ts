// Research OS — Edge / Historical Analog の雛形生成。
//
//   pnpm research:new:edge   --id=<kebab-id> --title="..."
//   pnpm research:new:analog --id=<kebab-id> --code=8136 --name="サンリオ" \
//                            --event-date=2026-05-29 --event-type=special_committee_report
//
// 雛形は「スキーマを必ず満たす骨格」＋「TODO コメント」で構成する。
// ChatGPT が毎時ゼロから YAML を書くと形式エラーが増えるため、器は OS 側が用意する。

import { join } from "path";
import { paths, writeNewFile } from "../io.js";
import { fail, parseArgs, todayJst } from "./common.js";

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function edgeTemplate(id: string, title: string, today: string): string {
  return `# Edge: ${title}
# 記入の原則:
#   - hypothesis / createdAt / id は作成後 immutable（変えたくなったら新しい Edge を作る）
#   - promotionGate の pass は evidence 必須。根拠のない pass は CI が落とす
#   - 出典は一次情報のみ（SNS・掲示板・匿名投稿は sourceType の enum に存在しない）
schemaVersion: 1
id: "${id}"
title: "${title}"
status: "idea"          # idea / research / shadow / production / rejected / deprecated
priority: "B"           # S / A / B / C
owner: "chatgpt-hourly"
createdAt: "${today}"
lastUpdate: "${today}"

# 検証可能な1文で書く。「〜のとき、〜が〜する」の形。
hypothesis: "TODO: 検証可能な仮説を1文で書く"

# なぜ利益が残るのか（因果機序）。誰がなぜ間違った値付けをしているのか。
mechanism: "TODO: 因果機序を書く"

confidence: 0.2         # 0-1

requiredData:
  - "TODO: 検証に必要なデータを列挙する"

# 一次情報。observedAt は「その情報が公に入手可能になった時刻」= PIT の基準。
evidence: []
# evidence:
#   - source: "https://..."
#     sourceType: "tdnet"
#     observedAt: "${today}T15:30:00+09:00"
#     eventDate: "${today}"
#     summary: "何がわかったか"

analogIds: []

entry:
  trigger: "TODO: 何を観測したらエントリーするか"
  side: "undecided"     # long / short / pair / undecided
exit:
  rule: "TODO: 何をもって手仕舞うか"
  invalidation: "TODO: この仮説が間違いだとわかる条件"

execution:
  feasibility: "unknown"
  borrowAvailability: "unknown"

# Research Queue の優先度計算に使う。根拠が無い数字は notes に前提を書く。
voiInputs:
  expectedNetAlphaBps: 0
  uncertaintyReduction: 0.5
  executionImprovement: 0
  researchCost: 0.3
  notes: "TODO: expectedNetAlphaBps の根拠"

samples:
  required: 20
  current: 0
  requiredAnalogs: 10

# Production Gate。すべて pass になるまで production にはできない。
promotionGate:
  sufficientSamples: { state: "unknown" }
  holdoutPass: { state: "unknown" }
  pitSafe: { state: "unknown" }
  netAlphaPositive: { state: "unknown" }
  executionFeasible: { state: "unknown" }
  liquiditySufficient: { state: "unknown" }
  borrowCostCovered: { state: "unknown" }
  confoundersRemoved: { state: "unknown" }
  counterfactualExplained: { state: "unknown" }
  decayChecked: { state: "unknown" }
  falseDiscoveryGuard: { state: "unknown" }

decay:
  reviewIntervalDays: 90

notes: ""
`;
}

function analogTemplate(
  id: string,
  code: string,
  name: string,
  eventDate: string,
  eventType: string,
  today: string,
): string {
  return `# Historical Analog: ${name} (${code}) ${eventDate}
# このファイルは作成後 immutable。訂正は新しい Analog を追加して行う。
schemaVersion: 1
id: "${id}"
eventType: "${eventType}"
companyCode: "${code}"
companyName: "${name}"
eventDate: "${eventDate}"
observedAt: "${eventDate}T15:30:00+09:00"   # TODO: 開示時刻に合わせる（PIT の基準）
source: "TODO: 一次情報の URL"
sourceType: "tdnet"
summary: "TODO: 何が起きたかを事実だけで書く"
recordedAt: "${today}"
edgeIds: []

# 価格データが手元に無い間は marketReaction / outcome を書かず、dataGaps に理由を残す。
dataGaps:
  - "TODO: 不足しているデータ（例: 価格系列が未取得）"
`;
}

function main(): void {
  const { options, positional } = parseArgs();
  const kind = positional[0];
  const id = options.get("id");
  const today = todayJst();

  if (!id || !ID_PATTERN.test(id)) fail("--id=<kebab-case> を指定してください（例: --id=filing-extension-resolution）");

  if (kind === "edge") {
    const title = options.get("title");
    if (!title) fail('--title="..." を指定してください');
    const file = join(paths.edges(), `${id}.yml`);
    writeNewFile(file, edgeTemplate(id, title, today));
    console.log(`✓ ${file} を作成しました`);
    console.log("  TODO を埋めたら pnpm research:validate を実行してください");
    return;
  }

  if (kind === "analog") {
    const code = options.get("code");
    const name = options.get("name");
    const eventDate = options.get("event-date");
    const eventType = options.get("event-type") ?? "other";
    if (!code || !name || !eventDate) {
      fail('--code=8136 --name="サンリオ" --event-date=2026-05-29 が必要です');
    }
    const file = join(paths.analogs(), `${id}.yml`);
    writeNewFile(file, analogTemplate(id, code, name, eventDate, eventType, today));
    console.log(`✓ ${file} を作成しました`);
    console.log("  TODO を埋めたら pnpm research:validate を実行してください");
    return;
  }

  fail("最初の引数に edge または analog を指定してください");
}

main();
