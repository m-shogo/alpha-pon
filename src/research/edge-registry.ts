// Research OS — Edge Registry の整合性検査と索引生成。
// 「重複 Edge 禁止」を機械的に守らせるのがこのモジュールの主目的。

import type { Edge, HistoricalAnalog, ResearchState } from "./types.js";
import { GATE_KEYS } from "./types.js";

export interface Issue {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
}

/**
 * 仮説の正規化フィンガープリント。
 * 表記ゆれ（空白・記号・全角半角・大小）を吸収してから FNV-1a でハッシュ化する。
 * 決定論的であることが重要（同じ仮説は常に同じ値）。
 */
export function hypothesisFingerprint(hypothesis: string): string {
  const normalized = normalizeHypothesis(hypothesis);
  let hash = 0x811c9dc5;
  for (const char of normalized) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function normalizeHypothesis(hypothesis: string): string {
  return hypothesis
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[、。,.:;!?！？「」『』（）()【】\[\]"'`~*_+\-–—/\\|]/g, "");
}

/** 文字バイグラムの Jaccard 類似度。近すぎる仮説（実質同じ Edge）を検出する。 */
export function hypothesisSimilarity(a: string, b: string): number {
  const gramsA = bigrams(normalizeHypothesis(a));
  const gramsB = bigrams(normalizeHypothesis(b));
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let intersection = 0;
  for (const gram of gramsA) if (gramsB.has(gram)) intersection += 1;
  return intersection / (gramsA.size + gramsB.size - intersection);
}

function bigrams(text: string): Set<string> {
  const chars = [...text];
  const result = new Set<string>();
  for (let i = 0; i + 1 < chars.length; i += 1) result.add(chars[i] + chars[i + 1]);
  return result;
}

export const DUPLICATE_ERROR_THRESHOLD = 0.9;
export const DUPLICATE_WARNING_THRESHOLD = 0.75;

/** Historical Analog の重複キー。同じ会社・同じ日・同じ事象は 1 件だけ。 */
export function analogKey(analog: HistoricalAnalog): string {
  return `${analog.companyCode}|${analog.eventDate}|${analog.eventType}`;
}

export function checkEdgeRegistry(state: ResearchState): Issue[] {
  const issues: Issue[] = [];
  const { edges, analogs } = state;

  // --- 重複 Edge -----------------------------------------------------------
  const byId = new Map<string, Edge>();
  for (const edge of edges) {
    if (byId.has(edge.id)) {
      issues.push({ severity: "error", code: "duplicate_edge_id", target: edge.id, message: "Edge id が重複しています" });
    }
    byId.set(edge.id, edge);
  }

  const byFingerprint = new Map<string, string>();
  for (const edge of edges) {
    const fingerprint = hypothesisFingerprint(edge.hypothesis);
    const existing = byFingerprint.get(fingerprint);
    if (existing) {
      issues.push({
        severity: "error",
        code: "duplicate_hypothesis",
        target: edge.id,
        message: `仮説が ${existing} と完全に同一です（重複 Edge 禁止）`,
      });
    } else {
      byFingerprint.set(fingerprint, edge.id);
    }
  }

  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const similarity = hypothesisSimilarity(edges[i].hypothesis, edges[j].hypothesis);
      if (similarity >= DUPLICATE_ERROR_THRESHOLD) {
        issues.push({
          severity: "error",
          code: "near_duplicate_hypothesis",
          target: `${edges[i].id} / ${edges[j].id}`,
          message: `仮説の類似度が ${similarity.toFixed(2)} です。実質同一の Edge は統合してください`,
        });
      } else if (similarity >= DUPLICATE_WARNING_THRESHOLD) {
        issues.push({
          severity: "warning",
          code: "similar_hypothesis",
          target: `${edges[i].id} / ${edges[j].id}`,
          message: `仮説の類似度が ${similarity.toFixed(2)} です。差分を明示できるか確認してください`,
        });
      }
    }
  }

  // --- 重複 Historical -----------------------------------------------------
  const analogById = new Map<string, HistoricalAnalog>();
  const analogByKey = new Map<string, string>();
  for (const analog of analogs) {
    if (analogById.has(analog.id)) {
      issues.push({
        severity: "error",
        code: "duplicate_analog_id",
        target: analog.id,
        message: "Historical Analog の id が重複しています",
      });
    }
    analogById.set(analog.id, analog);

    const key = analogKey(analog);
    const existing = analogByKey.get(key);
    if (existing) {
      issues.push({
        severity: "error",
        code: "duplicate_analog",
        target: analog.id,
        message: `同一事象（${key}）が ${existing} として既に登録されています`,
      });
    } else {
      analogByKey.set(key, analog.id);
    }
  }

  // --- 参照整合性 -----------------------------------------------------------
  for (const edge of edges) {
    for (const analogId of edge.analogIds ?? []) {
      if (!analogById.has(analogId)) {
        issues.push({
          severity: "error",
          code: "dangling_analog_ref",
          target: edge.id,
          message: `存在しない Historical Analog を参照しています: ${analogId}`,
        });
      }
    }
  }
  for (const analog of analogs) {
    for (const edgeId of analog.edgeIds ?? []) {
      if (!byId.has(edgeId)) {
        issues.push({
          severity: "error",
          code: "dangling_edge_ref",
          target: analog.id,
          message: `存在しない Edge を参照しています: ${edgeId}`,
        });
      }
    }
  }
  for (const cf of state.counterfactuals) {
    if (!analogById.has(cf.analogId)) {
      issues.push({
        severity: "error",
        code: "dangling_analog_ref",
        target: cf.id,
        message: `Counterfactual が存在しない Analog を参照しています: ${cf.analogId}`,
      });
    }
  }
  for (const confounder of state.confounders) {
    if (confounder.analogId && !analogById.has(confounder.analogId)) {
      issues.push({
        severity: "error",
        code: "dangling_analog_ref",
        target: confounder.id,
        message: `Confounder が存在しない Analog を参照しています: ${confounder.analogId}`,
      });
    }
  }

  // --- ステータス整合 -------------------------------------------------------
  for (const edge of edges) {
    if (edge.status === "rejected" && !edge.rejection) {
      issues.push({
        severity: "error",
        code: "missing_rejection",
        target: edge.id,
        message: "status: rejected には rejection（棄却理由）が必須です",
      });
    }
    if (edge.status !== "rejected" && edge.rejection) {
      issues.push({
        severity: "error",
        code: "unexpected_rejection",
        target: edge.id,
        message: "rejection があるのに status が rejected ではありません",
      });
    }
    for (const key of GATE_KEYS) {
      const item = edge.promotionGate[key];
      if (item.state === "pass" && !item.evidence?.trim()) {
        issues.push({
          severity: "error",
          code: "unevidenced_gate_pass",
          target: `${edge.id}.${key}`,
          message: "evidence なしの pass は認められません（自己申告 PASS の禁止）",
        });
      }
    }
    if (edge.samples.current > 0 && (edge.analogIds ?? []).length === 0) {
      issues.push({
        severity: "warning",
        code: "samples_without_analogs",
        target: edge.id,
        message: "サンプル数が 0 より大きいのに Historical Analog が紐付いていません",
      });
    }
  }

  return issues;
}

export interface EdgeIndexEntry {
  id: string;
  title: string;
  status: Edge["status"];
  priority: Edge["priority"];
  confidence: number;
  owner: string;
  lastUpdate: string;
  hypothesisFingerprint: string;
  analogCount: number;
  gatePassCount: number;
}

/** 生成物 index.generated.json の中身。決定論的（id 昇順）。 */
export function buildEdgeIndex(state: ResearchState): EdgeIndexEntry[] {
  return [...state.edges]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((edge) => ({
      id: edge.id,
      title: edge.title,
      status: edge.status,
      priority: edge.priority,
      confidence: edge.confidence,
      owner: edge.owner,
      lastUpdate: edge.lastUpdate,
      hypothesisFingerprint: hypothesisFingerprint(edge.hypothesis),
      analogCount: (edge.analogIds ?? []).length,
      gatePassCount: GATE_KEYS.filter((key) => edge.promotionGate[key].state === "pass").length,
    }));
}
