// Research OS — Research Dashboard 生成（純関数）。
// 入力はすべて生成済みのスナップショット。ここでは判断も研究もしない。表示するだけ。

import { buildDecayReport, type DecayReportEntry } from "./decay.js";
import type { Issue } from "./edge-registry.js";
import { evaluateGate, type GateEvaluation, type HoldoutAccessEntry } from "./promotion.js";
import type { ResearchQueue } from "./queue.js";
import type { Edge, EdgeStatus, ResearchState } from "./types.js";
import { GATE_KEYS } from "./types.js";

const STATUS_ORDER: EdgeStatus[] = ["production", "shadow", "research", "idea", "rejected", "deprecated"];

const STATUS_LABELS: Record<EdgeStatus, string> = {
  production: "Production",
  shadow: "Shadow",
  research: "Research",
  idea: "Idea",
  rejected: "Rejected",
  deprecated: "Deprecated",
};

export interface DashboardInput {
  state: ResearchState;
  queue: ResearchQueue;
  accessLog: HoldoutAccessEntry[];
  issues: Issue[];
  asOf: string;
  generatedAt: string;
}

function countByStatus(edges: Edge[]): Record<EdgeStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0])) as Record<EdgeStatus, number>;
  for (const edge of edges) counts[edge.status] += 1;
  return counts;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "_該当なし_\n";
  const separator = headers.map(() => "---");
  return [headers, separator, ...rows].map((row) => `| ${row.join(" | ")} |`).join("\n") + "\n";
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function buildDashboard(input: DashboardInput): string {
  const { state, queue, accessLog, issues, asOf, generatedAt } = input;
  const counts = countByStatus(state.edges);
  const decayReport = buildDecayReport(state, asOf);
  const evaluations = new Map<string, GateEvaluation>(
    state.edges.map((edge) => [edge.id, evaluateGate(edge, state, accessLog, asOf)]),
  );

  const promotionReady = state.edges.filter(
    (edge) => edge.status === "shadow" && evaluations.get(edge.id)?.promotable,
  );
  const holdoutReady = state.edges.filter((edge) => {
    const evaluation = evaluations.get(edge.id);
    if (!evaluation || edge.status === "production" || edge.status === "rejected") return false;
    const remaining = evaluation.blockers.filter((blocker) => blocker.gate !== "holdoutPass");
    return edge.promotionGate.holdoutPass.state !== "pass" && remaining.length === 0;
  });

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  const lines: string[] = [];
  lines.push("# Research Dashboard");
  lines.push("");
  lines.push("> このファイルは生成物です。直接編集しないでください（`pnpm research:dashboard` で再生成）。");
  lines.push("");
  lines.push(`- 基準日 (asOf): ${asOf}`);
  lines.push(`- 生成時刻: ${generatedAt}`);
  lines.push(
    `- Edge: ${state.edges.length} 件 / Historical Analog: ${state.analogs.length} 件 / Counterfactual: ${state.counterfactuals.length} 件 / Confounder: ${state.confounders.length} 件`,
  );
  lines.push(
    `- 整合性: エラー ${errors.length} 件 / 警告 ${warnings.length} 件` +
      (errors.length === 0 ? "" : " ← **CI は失敗します**"),
  );
  lines.push("");

  lines.push("## ステータス別");
  lines.push("");
  lines.push(
    table(
      ["Status", "件数"],
      STATUS_ORDER.map((status) => [STATUS_LABELS[status], String(counts[status])]),
    ),
  );

  lines.push("## 次に研究するもの（VOI 上位）");
  lines.push("");
  lines.push(
    table(
      ["#", "Edge", "Status", "VOI", "理由", "推奨アクション"],
      queue.entries
        .slice(0, 10)
        .map((entry) => [
          String(entry.rank),
          escapeCell(`${entry.edgeId}`),
          entry.status,
          entry.voi.toFixed(3),
          escapeCell(entry.drivers.join(" / ")),
          escapeCell(entry.suggestedAction),
        ]),
    ),
  );

  lines.push("## Promotion Ready（Gate 全通過・人間の昇格判断待ち）");
  lines.push("");
  lines.push(
    table(
      ["Edge", "Status", "Gate"],
      promotionReady.map((edge) => [
        escapeCell(edge.id),
        edge.status,
        `${evaluations.get(edge.id)?.passCount ?? 0}/${GATE_KEYS.length}`,
      ]),
    ),
  );

  lines.push("## Holdout Ready（Holdout 開封以外は揃っている）");
  lines.push("");
  lines.push(
    table(
      ["Edge", "Status", "Gate"],
      holdoutReady.map((edge) => [
        escapeCell(edge.id),
        edge.status,
        `${evaluations.get(edge.id)?.passCount ?? 0}/${GATE_KEYS.length}`,
      ]),
    ),
  );

  lines.push("## Edge 一覧");
  lines.push("");
  const sortedEdges = [...state.edges].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (a.id < b.id ? -1 : 1),
  );
  lines.push(
    table(
      ["Edge", "Status", "Priority", "Confidence", "Gate", "Analog", "Sample", "Last Update"],
      sortedEdges.map((edge) => [
        escapeCell(edge.id),
        STATUS_LABELS[edge.status],
        edge.priority,
        edge.confidence.toFixed(2),
        `${evaluations.get(edge.id)?.passCount ?? 0}/${GATE_KEYS.length}`,
        String((edge.analogIds ?? []).length),
        `${edge.samples.current}/${edge.samples.required}`,
        edge.lastUpdate,
      ]),
    ),
  );

  lines.push("## Edge Decay");
  lines.push("");
  const decayRows = decayReport.filter((entry) => entry.decayStatus !== "fresh");
  lines.push(
    table(
      ["Edge", "Status", "Decay", "最終確認", "経過日数", "アクション"],
      decayRows.map((entry: DecayReportEntry) => [
        escapeCell(entry.edgeId),
        entry.status,
        entry.decayStatus,
        entry.lastCheckedAt ?? "-",
        entry.daysSinceCheck === null ? "-" : String(entry.daysSinceCheck),
        escapeCell(entry.action),
      ]),
    ),
  );

  lines.push("## 整合性チェック");
  lines.push("");
  lines.push(
    table(
      ["Severity", "Code", "対象", "内容"],
      issues
        .slice()
        .sort(
          (a, b) =>
            (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
            (a.code < b.code ? -1 : 1),
        )
        .slice(0, 50)
        .map((issue) => [issue.severity, issue.code, escapeCell(issue.target), escapeCell(issue.message)]),
    ),
  );

  lines.push("## Checkpoint（次回はここから）");
  lines.push("");
  if (!state.checkpoint) {
    lines.push("_Checkpoint がまだありません。`pnpm research:checkpoint` で保存してください。_");
  } else {
    const checkpoint = state.checkpoint;
    lines.push(`- sequence: ${checkpoint.sequence}（保存: ${checkpoint.savedAt} / ${checkpoint.actor}）`);
    lines.push(`- 今回行った研究: ${checkpoint.researchDone}`);
    if (checkpoint.dataGaps.length > 0) {
      lines.push(`- 不足データ: ${checkpoint.dataGaps.join(" / ")}`);
    }
    lines.push("- 次回研究候補:");
    for (const candidate of checkpoint.nextCandidates) {
      lines.push(`  - \`${candidate.edgeId}\` — ${candidate.why}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}
