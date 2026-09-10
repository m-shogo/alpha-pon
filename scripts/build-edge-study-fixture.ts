// Edge 検証チェーンの end-to-end 用 fixture を生成する。
//
//   node --import tsx/esm scripts/build-edge-study-fixture.ts
//
// **合成データ**であり、実在の銘柄・実際の相場ではない。
// 価格は決定論的な擬似乱数で作っており、Edge が存在するように仕込んでいない。
// 目的は「検出 → Holdout除外 → 対照群 → イベントスタディ」の配管確認だけ。

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PriceSeries } from "../src/research/backtest.js";

const OUT = resolve(process.cwd(), "research/fixtures/edge-studies/synthetic-abnormal-move.json");

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state * 1_664_525 + 1_013_904_223) >>> 0; return state / 4_294_967_296; };
}

function businessDays(start: string, count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// Holdout は 2025-07-01〜2026-06-30。その前後にまたがる期間を作る。
const DATES = businessDays("2026-05-01", 90);

function makeSeries(code: string, seed: number, shocks: Record<string, number>): PriceSeries {
  const random = lcg(seed);
  let close = 1000 + (seed % 400);
  return {
    code,
    bars: DATES.map((date) => {
      const previous = close;
      const move = shocks[date] ?? (random() - 0.5) * 1.6;
      close = Math.max(1, Math.round(previous * (1 + move / 100) * 100) / 100);
      return {
        date,
        open: previous,
        high: Math.max(previous, close) + 3,
        low: Math.max(1, Math.min(previous, close) - 3),
        close,
        volume: 1_600_000,
      };
    }),
  };
}

// 封印期間内に1件、封印明けに2件のショックを置く。
const SEALED_SHOCK = DATES[10];   // 2026-05 中旬 → 封印内
const OPEN_SHOCK_A = DATES[55];   // 2026-07 以降 → 封印外
const OPEN_SHOCK_B = DATES[70];

const codes = Array.from({ length: 24 }, (_, index) => String(9001 + index));
const shockByCode: Record<string, Record<string, number>> = {
  "9001": { [SEALED_SHOCK]: -13 },
  "9002": { [OPEN_SHOCK_A]: -12 },
  "9003": { [OPEN_SHOCK_B]: -14 },
  // 対照候補: 同じくらい下げるが別日・別銘柄
  "9010": { [OPEN_SHOCK_A]: -11.5 },
  "9011": { [OPEN_SHOCK_B]: -13.0 },
  "9012": { [OPEN_SHOCK_A]: -12.5 },
  "9013": { [OPEN_SHOCK_B]: -13.5 },
};

const prices = codes.map((code, index) => makeSeries(code, 700 + index * 31, shockByCode[code] ?? {}));
const benchmark = makeSeries("1306", 17, {});

const bundle = {
  edgeId: "synthetic-abnormal-move",
  specId: "synthetic-abnormal-move-v1",
  detector: {
    kind: "abnormal_move" as const,
    params: {
      abnormalReturnThresholdPct: -10,
      knownEventDates: {},
      corporateActionDates: {},
      minAverageTurnoverJpy: 100_000_000,
    },
  },
  control: {
    abnormalReturnTolerancePct: 3,
    maxDateOffsetDays: 7,
    controlsPerTreatment: 2,
    allowReuse: false,
    knownEventDates: {},
    corporateActionDates: {},
  },
  eventStudy: { horizons: [1, 5, 20] },
  // ラベリング工程の出力を模す。9002 / 9003 を treatment とし、
  // 同程度下げた 9010〜9013 は対照候補として残す。
  // これを省くと検出候補すべてが treatment になり、構造的に対照が作れない。
  treatmentCandidateIds: [`am-9002-${OPEN_SHOCK_A}`, `am-9003-${OPEN_SHOCK_B}`],
  holdout: {
    manifest: {
      schemaVersion: 1 as const,
      sealedAt: "2026-08-04",
      policy: "Production Gate 判定のとき以外は一切参照しない（合成 fixture 用の写し）",
      windows: [
        {
          id: "vault-2025h2-2026h1",
          from: "2025-07-01",
          to: "2026-06-30",
          scope: "all_universe" as const,
        },
      ],
    },
  },
  prices,
  benchmark,
};

writeFileSync(OUT, `${JSON.stringify(bundle, null, 2)}\n`, "utf-8");
console.log(`wrote ${OUT}`);
console.log(`  銘柄 ${prices.length} / 営業日 ${DATES.length}`);
console.log(`  封印内ショック ${SEALED_SHOCK} / 封印外ショック ${OPEN_SHOCK_A}, ${OPEN_SHOCK_B}`);
