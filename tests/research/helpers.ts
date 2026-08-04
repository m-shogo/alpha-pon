// research テスト共通のフィクスチャビルダー。
// 完全な Edge を毎回手書きすると本質が埋もれるので、valid フィクスチャを土台にして差分だけ書く。

import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import type { Edge, HistoricalAnalog, ResearchState } from "../../src/research/types.js";

const BASE_EDGE = load(readFileSync("research/fixtures/valid/edge-complete.yml", "utf-8")) as Edge;

export function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    ...structuredClone(BASE_EDGE),
    ...structuredClone(overrides) as Partial<Edge>,
  } as Edge;
}

export function makeAnalog(overrides: Partial<HistoricalAnalog> = {}): HistoricalAnalog {
  const base: HistoricalAnalog = {
    schemaVersion: 1,
    id: "fixture-analog",
    eventType: "special_committee_report",
    companyCode: "9999",
    companyName: "フィクスチャ社",
    eventDate: "2024-01-04",
    observedAt: "2024-01-04T15:30:00+09:00",
    source: "https://example.invalid/fixture",
    sourceType: "tdnet",
    summary: "フィクスチャ用の事例",
    recordedAt: "2024-01-05",
  };
  return { ...base, ...structuredClone(overrides) } as HistoricalAnalog;
}

export function makeState(overrides: Partial<ResearchState> = {}): ResearchState {
  return {
    edges: [],
    analogs: [],
    counterfactuals: [],
    confounders: [],
    checkpoint: null,
    ...overrides,
  };
}
