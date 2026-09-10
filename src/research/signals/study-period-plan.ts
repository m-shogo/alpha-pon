// Research OS — 探索期間 / 確認期間の事前登録と分割 v1。
//
// 目的:
//   閾値やパラメータを決める期間（探索）と、
//   それを検証する期間（確認）を **結果を見る前に** 固定する。
//
// なぜ必要か:
//   既存 Edge の promotionGate が明示的に要求している。
//     holdoutPass: "探索期間、confirmatory期間、untouched issuer-level holdout を事前固定していない"
//     falseDiscoveryGuard: "閾値決定と confirmatory/holdout を分離する必要がある"
//
//   探索と確認を分けずに全期間で閾値を探すと、
//   その閾値は「過去にたまたま効いた値」になる。
//   確認期間を後から選べるなら、分けた意味も無い。
//
// この実装の要点:
//   **確認期間は1つの計画につき1回しか使えない。**
//   同じ計画で確認を2回走らせるのは、確認集合の上でパラメータを選ぶ行為であり、
//   分割の目的を無効にする。台帳に記録して検出する。
//
// 設計方針:
//   - 計画は内容から決まる planId を持つ。後から期間をずらせば別計画になる。
//   - 探索 → 確認 の時間順を強制する。未来で決めた閾値を過去で確認しない。
//   - Holdout と重ならないことを検査する。
//   - 判断は純関数。台帳の読み書きは呼び出し側。

import { createHash } from "node:crypto";
import { stableStringify } from "../schema.js";
import type { HoldoutVaultManifest } from "./holdout-partition.js";

export type StudyPeriodPhase = "explore" | "confirm" | "holdout" | "outside";

export interface StudyPeriodWindow {
  from: string;
  to: string;
}

export interface StudyPeriodPlanInput {
  edgeId: string;
  /** 閾値やパラメータを決めてよい期間。 */
  explore: StudyPeriodWindow;
  /** 探索で決めた設定を検証する期間。1回しか使えない。 */
  confirm: StudyPeriodWindow;
  /** 触らない封印期間の id。 */
  holdoutWindowIds: string[];
  /** なぜこの区切りにしたか。 */
  rationale: string;
}

export interface StudyPeriodPlan extends StudyPeriodPlanInput {
  schemaVersion: 1;
  planId: string;
  registeredAt: string;
}

export interface StudyPeriodSample {
  id: string;
  code: string;
  date: string;
}

export interface StudyPeriodPartition {
  explore: StudyPeriodSample[];
  confirm: StudyPeriodSample[];
  holdout: StudyPeriodSample[];
  /** どの期間にも属さないサンプル。 */
  outside: StudyPeriodSample[];
  countByPhase: Record<StudyPeriodPhase, number>;
  warnings: string[];
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertWindow(window: StudyPeriodWindow, label: string): void {
  for (const [field, value] of [["from", window.from], ["to", window.to]] as const) {
    if (!ISO_DATE_PATTERN.test(value)) throw new Error(`${label}.${field} must be YYYY-MM-DD: ${value}`);
  }
  if (window.from > window.to) throw new Error(`${label}: from must be on or before to`);
}

function overlaps(left: StudyPeriodWindow, right: StudyPeriodWindow): boolean {
  return left.from <= right.to && right.from <= left.to;
}

export function assertStudyPeriodPlanInput(input: StudyPeriodPlanInput): void {
  if (typeof input.edgeId !== "string" || input.edgeId.trim() === "") {
    throw new Error("study period plan edgeId must be a non-empty string");
  }
  if (typeof input.rationale !== "string" || input.rationale.trim() === "") {
    throw new Error("study period plan rationale must be a non-empty string: なぜこの区切りかを書く");
  }
  assertWindow(input.explore, "explore");
  assertWindow(input.confirm, "confirm");
  if (overlaps(input.explore, input.confirm)) {
    throw new Error("explore と confirm は重ねられません。閾値を決めた期間で確認しても意味がない");
  }
  // 未来で決めた閾値を過去で確認するのは walk-forward ではない。
  if (input.confirm.from <= input.explore.to) {
    throw new Error(
      "confirm は explore より後の期間にしてください"
      + `（explore ${input.explore.to} → confirm ${input.confirm.from}）`,
    );
  }
  if (!Array.isArray(input.holdoutWindowIds)) {
    throw new Error("holdoutWindowIds must be an array");
  }
}

export function computeStudyPeriodPlanId(input: StudyPeriodPlanInput): string {
  const canonical = stableStringify({
    edgeId: input.edgeId,
    explore: input.explore,
    confirm: input.confirm,
    holdoutWindowIds: [...input.holdoutWindowIds].sort(),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export function buildStudyPeriodPlan(
  input: StudyPeriodPlanInput,
  now: Date = new Date(),
): StudyPeriodPlan {
  assertStudyPeriodPlanInput(input);
  return {
    schemaVersion: 1,
    planId: computeStudyPeriodPlanId(input),
    registeredAt: now.toISOString(),
    ...input,
  };
}

/** 計画が Holdout と重なっていないことを確かめる。 */
export function assertPlanAvoidsHoldout(
  plan: StudyPeriodPlan,
  manifest: HoldoutVaultManifest,
): void {
  for (const window of manifest.windows) {
    for (const [label, phase] of [["explore", plan.explore], ["confirm", plan.confirm]] as const) {
      if (overlaps(phase, { from: window.from, to: window.to })) {
        throw new Error(
          `${label} 期間が Holdout ${window.id}（${window.from}〜${window.to}）と重なっています。`
          + "封印期間で閾値を決めたり確認したりしてはいけません",
        );
      }
    }
  }
}

/**
 * サンプルを探索 / 確認 / 封印 / 期間外へ分ける。
 *
 * どの期間にも属さないサンプルも数える。黙って落とすと標本数が実態と食い違う。
 */
export function partitionByStudyPeriod(
  samples: readonly StudyPeriodSample[],
  plan: StudyPeriodPlan,
  manifest?: HoldoutVaultManifest,
): StudyPeriodPartition {
  assertStudyPeriodPlanInput(plan);
  for (const sample of samples) {
    if (!ISO_DATE_PATTERN.test(sample.date)) {
      throw new Error(`study period sample ${sample.id}.date must be YYYY-MM-DD: ${sample.date}`);
    }
  }
  const holdoutWindows = (manifest?.windows ?? []).filter(
    (window) => plan.holdoutWindowIds.includes(window.id),
  );

  const buckets: Record<StudyPeriodPhase, StudyPeriodSample[]> = {
    explore: [], confirm: [], holdout: [], outside: [],
  };

  for (const sample of samples) {
    const inHoldout = holdoutWindows.some((window) => {
      if (sample.date < window.from || sample.date > window.to) return false;
      if (window.scope === "all_universe") return true;
      return (window.codes ?? []).includes(sample.code);
    });
    if (inHoldout) { buckets.holdout.push(sample); continue; }
    if (sample.date >= plan.explore.from && sample.date <= plan.explore.to) {
      buckets.explore.push(sample);
      continue;
    }
    if (sample.date >= plan.confirm.from && sample.date <= plan.confirm.to) {
      buckets.confirm.push(sample);
      continue;
    }
    buckets.outside.push(sample);
  }

  const warnings: string[] = [];
  if (buckets.outside.length > 0) {
    warnings.push(
      `どの期間にも属さないサンプルが ${buckets.outside.length} 件あります。`
      + "計画の期間設定を確認してください",
    );
  }
  if (buckets.explore.length === 0) warnings.push("探索期間のサンプルが0件です");
  if (buckets.confirm.length === 0) warnings.push("確認期間のサンプルが0件です");

  return {
    ...buckets,
    countByPhase: {
      explore: buckets.explore.length,
      confirm: buckets.confirm.length,
      holdout: buckets.holdout.length,
      outside: buckets.outside.length,
    },
    warnings,
  };
}

export interface ConfirmatoryRunRecord {
  planId: string;
  edgeId: string;
  runAt: string;
  /** その回に使った設定の指紋。 */
  paramsHash: string;
}

export interface ConfirmatoryUsageCheck {
  allowed: boolean;
  priorRunCount: number;
  reason: string;
}

/**
 * 確認期間を使ってよいかを判定する。
 *
 * **1つの計画につき1回まで。** 同じ計画で2回目を走らせるのは、
 * 確認集合の上でパラメータを選ぶ行為であり、分割の目的を無効にする。
 * 設定を変えたいなら期間を切り直して別計画にする。
 */
export function checkConfirmatoryUsage(
  plan: StudyPeriodPlan,
  priorRuns: readonly ConfirmatoryRunRecord[],
  paramsHash: string,
): ConfirmatoryUsageCheck {
  const forPlan = priorRuns.filter((run) => run.planId === plan.planId);
  if (forPlan.length === 0) {
    return { allowed: true, priorRunCount: 0, reason: "初回の確認実行" };
  }
  // 同一設定の再実行は再現性の確認なので許す。
  if (forPlan.every((run) => run.paramsHash === paramsHash)) {
    return {
      allowed: true,
      priorRunCount: forPlan.length,
      reason: "同一設定の再実行（再現性の確認）",
    };
  }
  return {
    allowed: false,
    priorRunCount: forPlan.length,
    reason:
      `計画 ${plan.planId} の確認期間は既に ${forPlan.length} 回、別の設定で使われています。`
      + "確認集合の上でパラメータを選ぶことになるため、これ以上は使えません。"
      + "期間を切り直して別計画として登録してください",
  };
}
