// Research OS — Value of Information Scheduler / Research Queue。
//
// 毎時 ChatGPT は「思いつき」ではなく、このモジュールが出した 1 位を研究する。
// すべて純関数。同じ state と同じ asOf なら、常に同じ順位になる（決定論的）。

import { isValidDate } from "./schema.js";
import type { Edge, EdgeStatus, ResearchState } from "./types.js";
import { GATE_KEYS } from "./types.js";

export interface QueueWeights {
  /** expectedNetAlphaBps をこの値で 1.0 に正規化する */
  roiNormalizationBps: number;
  expectedRoi: number;
  uncertaintyReduction: number;
  sampleGap: number;
  historicalGap: number;
  productionProximity: number;
  decayUrgency: number;
  executionImprovement: number;
  priority: number;
  /** 研究コストにかかる負の重み（正の数で書き、内部で減算する） */
  researchCost: number;
}

export const DEFAULT_WEIGHTS: QueueWeights = {
  roiNormalizationBps: 300,
  expectedRoi: 0.25,
  uncertaintyReduction: 0.2,
  sampleGap: 0.15,
  historicalGap: 0.15,
  productionProximity: 0.1,
  decayUrgency: 0.2,
  executionImprovement: 0.05,
  priority: 0.1,
  researchCost: 0.1,
};

export const PRIORITY_SCORE: Record<Edge["priority"], number> = { S: 1, A: 0.75, B: 0.5, C: 0.25 };

/** Queue に載らない status。production は Decay 期限が来たときだけ再浮上する。 */
const EXCLUDED_STATUSES: ReadonlySet<EdgeStatus> = new Set(["rejected", "deprecated"]);

export interface QueueComponents {
  expectedRoi: number;
  uncertaintyReduction: number;
  sampleGap: number;
  historicalGap: number;
  productionProximity: number;
  decayUrgency: number;
  executionImprovement: number;
  priority: number;
  researchCost: number;
}

export interface QueueEntry {
  rank: number;
  edgeId: string;
  title: string;
  status: EdgeStatus;
  voi: number;
  components: QueueComponents;
  /** 上位に来た理由（貢献度の大きい順に最大3つ） */
  drivers: string[];
  suggestedAction: string;
}

export interface ResearchQueue {
  schemaVersion: 1;
  asOf: string;
  weights: QueueWeights;
  entries: QueueEntry[];
  excluded: Array<{ edgeId: string; reason: string }>;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  // 浮動小数の揺れで差分が出ないよう、生成物は必ず丸める
  return Math.round(value * 1e6) / 1e6;
}

function daysBetween(from: string, to: string): number {
  if (!isValidDate(from)) throw new Error(`invalid research date: ${from}`);
  if (!isValidDate(to)) throw new Error(`invalid research date: ${to}`);
  return Math.round((Date.parse(`${to}T00:00:00+09:00`) - Date.parse(`${from}T00:00:00+09:00`)) / 86_400_000);
}

export function gatePassCount(edge: Edge): number {
  return GATE_KEYS.filter((key) => edge.promotionGate[key].state === "pass").length;
}

export function decayUrgency(edge: Edge, asOf: string): number {
  if (!edge.decay.lastCheckedAt) return 1;
  const elapsed = daysBetween(edge.decay.lastCheckedAt, asOf);
  return clamp01(elapsed / edge.decay.reviewIntervalDays);
}

export function computeComponents(edge: Edge, analogCount: number, asOf: string, weights: QueueWeights): QueueComponents {
  const { required, current, requiredAnalogs } = edge.samples;
  return {
    expectedRoi: clamp01(edge.voiInputs.expectedNetAlphaBps / weights.roiNormalizationBps),
    uncertaintyReduction: clamp01(edge.voiInputs.uncertaintyReduction),
    sampleGap: clamp01((required - current) / required),
    historicalGap: clamp01((requiredAnalogs - analogCount) / requiredAnalogs),
    productionProximity: gatePassCount(edge) / GATE_KEYS.length,
    decayUrgency: decayUrgency(edge, asOf),
    executionImprovement: clamp01(edge.voiInputs.executionImprovement ?? 0),
    priority: PRIORITY_SCORE[edge.priority],
    researchCost: clamp01(edge.voiInputs.researchCost),
  };
}

export function scoreEdge(components: QueueComponents, weights: QueueWeights): number {
  return (
    components.expectedRoi * weights.expectedRoi +
    components.uncertaintyReduction * weights.uncertaintyReduction +
    components.sampleGap * weights.sampleGap +
    components.historicalGap * weights.historicalGap +
    components.productionProximity * weights.productionProximity +
    components.decayUrgency * weights.decayUrgency +
    components.executionImprovement * weights.executionImprovement +
    components.priority * weights.priority -
    components.researchCost * weights.researchCost
  );
}

const DRIVER_LABELS: Record<keyof QueueComponents, string> = {
  expectedRoi: "期待 Net Alpha が大きい",
  uncertaintyReduction: "1回の研究で不確実性が大きく減る",
  sampleGap: "サンプルが不足している",
  historicalGap: "Historical Analog が不足している",
  productionProximity: "Production Gate の充足が進んでいる",
  decayUrgency: "Decay 再検証の期限が来ている",
  executionImprovement: "Execution 改善の余地がある",
  priority: "優先度が高い",
  researchCost: "研究コスト",
};

function buildDrivers(components: QueueComponents, weights: QueueWeights): string[] {
  return (Object.keys(DRIVER_LABELS) as Array<keyof QueueComponents>)
    .filter((key) => key !== "researchCost")
    .map((key) => ({ key, contribution: components[key] * (weights[key] as number) }))
    .filter((item) => item.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution || (a.key < b.key ? -1 : 1))
    .slice(0, 3)
    .map((item) => DRIVER_LABELS[item.key]);
}

function suggestAction(edge: Edge, components: QueueComponents): string {
  if (components.decayUrgency >= 1) return "Decay 再検証：直近データで Edge がまだ生きているか確認する";
  if (components.historicalGap > 0.5) return "Historical Analog を追加する（一次情報から事例を1件以上）";
  if (components.sampleGap > 0.5) return "サンプルを増やす：該当イベントを網羅的に洗い出す";
  const unknownGate = GATE_KEYS.find((key) => edge.promotionGate[key].state === "unknown");
  if (unknownGate) return `Production Gate の未確認項目を埋める：${unknownGate}`;
  return "Net Alpha と Execution を再評価する";
}

export function buildQueue(
  state: ResearchState,
  asOf: string,
  weights: QueueWeights = DEFAULT_WEIGHTS,
): ResearchQueue {
  const analogCountByEdge = new Map<string, number>();
  for (const edge of state.edges) analogCountByEdge.set(edge.id, (edge.analogIds ?? []).length);

  const excluded: ResearchQueue["excluded"] = [];
  const scored: QueueEntry[] = [];

  for (const edge of state.edges) {
    if (EXCLUDED_STATUSES.has(edge.status)) {
      excluded.push({ edgeId: edge.id, reason: `status=${edge.status} のため対象外` });
      continue;
    }
    const components = computeComponents(edge, analogCountByEdge.get(edge.id) ?? 0, asOf, weights);
    if (edge.status === "production" && components.decayUrgency < 1) {
      excluded.push({ edgeId: edge.id, reason: "production かつ Decay 再検証期限に未到達" });
      continue;
    }
    scored.push({
      rank: 0,
      edgeId: edge.id,
      title: edge.title,
      status: edge.status,
      voi: round(scoreEdge(components, weights)),
      components: Object.fromEntries(
        Object.entries(components).map(([key, value]) => [key, round(value)]),
      ) as unknown as QueueComponents,
      drivers: buildDrivers(components, weights),
      suggestedAction: suggestAction(edge, components),
    });
  }

  // 同点は id の辞書順で解決する（決定論的）
  scored.sort((a, b) => b.voi - a.voi || (a.edgeId < b.edgeId ? -1 : 1));
  scored.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return {
    schemaVersion: 1,
    asOf,
    weights,
    entries: scored,
    excluded: excluded.sort((a, b) => (a.edgeId < b.edgeId ? -1 : 1)),
  };
}