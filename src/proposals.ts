import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { readProposalScores } from "./proposals-score-input.js";

type Priority = "S" | "A" | "B" | "Hold";
type Proposal = {
  priority: Priority;
  title: string;
  reason: string;
  evidence: string[];
  action: string;
  safety: string;
};

type PipelineStep = {
  name: string;
  criticality: string;
  status: string;
  code: number;
  durationSec?: number;
};

type PipelineStatus = {
  status?: string;
  failedSteps?: string;
  steps?: PipelineStep[];
};

type ScoreLogEntry = {
  code: string;
  name: string;
  score: number;
  alertLevel: string;
  dataQuality?: string;
  warnings?: string[];
  negativeReasons?: string[];
  marketContext?: unknown;
  financialQuality?: unknown;
  primaryDisclosureReview?: {
    decision?: string;
    sourceCoverage?: {
      tdnetCount?: number;
      edinetCount?: number;
      fetchErrorCount?: number;
    };
    blockers?: string[];
    warnings?: string[];
  };
  expertReview?: {
    finalVerdict?: string;
    consensusScore?: number;
  };
  riskReview?: {
    decision?: string;
    blockers?: string[];
  };
};

type RuleDiagnostic = {
  rule: string;
  diagnosis: string;
  count: number;
  pricedCount: number;
  directionExpectation: number;
  avgRelativeReturnPct: number | null;
  avgLossRelativeReturnPct: number | null;
  reason: string;
  action: string;
};

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "N/A";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function countWarnings(scores: ScoreLogEntry[], keyword: string): number {
  return scores.filter(score => (score.warnings ?? []).some(warning => warning.includes(keyword))).length;
}

function pushProposal(proposals: Proposal[], proposal: Proposal): void {
  const key = `${proposal.priority}:${proposal.title}`;
  if (proposals.some(existing => `${existing.priority}:${existing.title}` === key)) return;
  proposals.push(proposal);
}

function priorityRank(priority: Priority): number {
  return { S: 0, A: 1, B: 2, Hold: 3 }[priority];
}

function buildProposals(input: {
  pipeline: PipelineStatus | null;
  scores: ScoreLogEntry[];
  ruleDiagnostics: RuleDiagnostic[];
}): Proposal[] {
  const { pipeline, scores, ruleDiagnostics } = input;
  const proposals: Proposal[] = [];
  const total = scores.length;
  const dataMissing = scores.filter(score => score.dataQuality === "missing" || !score.dataQuality).length;
  const dataPartial = scores.filter(score => score.dataQuality === "partial").length;
  const marketContextCount = scores.filter(score => !!score.marketContext).length;
  const financialQualityCount = scores.filter(score => !!score.financialQuality).length;
  const primaryReviewCount = scores.filter(score => !!score.primaryDisclosureReview).length;
  const primaryMissing = scores.filter(score => score.primaryDisclosureReview?.decision === "missing" || !score.primaryDisclosureReview).length;
  const primaryBlock = scores.filter(score => score.primaryDisclosureReview?.decision === "block").length;
  const primaryFetchErrors = scores.reduce((sum, score) => sum + (score.primaryDisclosureReview?.sourceCoverage?.fetchErrorCount ?? 0), 0);
  const jquantsWarnings = countWarnings(scores, "JQUANTS") + countWarnings(scores, "株価データ") + countWarnings(scores, "ベンチマーク");
  const primaryWarnings = countWarnings(scores, "一次情報");
  const expertBlocks = scores.filter(score => score.expertReview?.finalVerdict === "block").length;
  const riskRejects = scores.filter(score => score.riskReview?.decision === "reject").length;
  const criticalFailures = pipeline?.steps?.filter(step => step.criticality === "critical" && step.status !== "ok") ?? [];

  if (!pipeline || !pipeline.status) {
    pushProposal(proposals, {
      priority: "S",
      title: "pipeline_status の生成を最優先で確認する",
      reason: "pipeline の成否が見えないと、毎朝の自動運用で異常を見逃します。",
      evidence: ["reports/pipeline_status_latest.json が存在しない、または読めない"],
      action: "bash scripts/ci-pipeline-smoke.sh を実行し、pipeline_status_latest.json の生成を確認する。",
      safety: "statusが見えない日は提案や通知を過信しない。",
    });
  }

  if (criticalFailures.length > 0) {
    pushProposal(proposals, {
      priority: "S",
      title: "critical step の失敗を先に直す",
      reason: "daily が失敗している日は、後続レポートが残っていても判断材料として弱いです。",
      evidence: criticalFailures.map(step => `${step.name}:${step.status}:${step.code}`),
      action: "daily のエラーを最優先で修正し、noncritical改善は後回しにする。",
      safety: "critical失敗時は調査候補を生成済みとして扱わない。",
    });
  }

  if (total === 0) {
    pushProposal(proposals, {
      priority: "S",
      title: "score log が空の原因を確認する",
      reason: "scores_YYYY-MM-DD.json がないと、学習・提案・答え合わせが成立しません。",
      evidence: ["score entries = 0"],
      action: "pnpm daily:mock と pnpm daily のどちらで止まっているか切り分ける。",
      safety: "score logがない日は改善提案を保留する。",
    });
    return proposals;
  }

  if (dataMissing / total > 0.4 || jquantsWarnings > total * 0.3) {
    pushProposal(proposals, {
      priority: "S",
      title: "J-Quants / 株価 / ベンチマーク取得率を改善する",
      reason: "価格・ベンチマーク比が弱いと、same/oppositeや相対リターンの答え合わせが歪みます。",
      evidence: [`dataQuality missing=${dataMissing}/${total} (${pct(dataMissing, total)})`, `J-Quants系warning=${jquantsWarnings}`],
      action: "JQUANTS_API_KEY、MARKET_BENCHMARK_CODE、欠損時のfallbackを確認する。",
      safety: "価格データ欠損時は通知ではなくログ扱いを維持する。",
    });
  }

  if (marketContextCount / total < 0.6) {
    pushProposal(proposals, {
      priority: "A",
      title: "marketContext の取得率を上げる",
      reason: "市場全体との比較がないと、銘柄固有の強さと地合いの良さを分けられません。",
      evidence: [`marketContext=${marketContextCount}/${total} (${pct(marketContextCount, total)})`],
      action: "ベンチマーク日足の取得、銘柄コード形式、日足件数不足を確認する。",
      safety: "marketContext欠損時はスコア加点を控えめにする。",
    });
  }

  if (financialQualityCount / total < 0.6) {
    pushProposal(proposals, {
      priority: "A",
      title: "財務品質の取得率を上げる",
      reason: "長期投資の調査候補ではROIC/FCF/自己資本などの品質確認が重要です。",
      evidence: [`financialQuality=${financialQualityCount}/${total} (${pct(financialQualityCount, total)})`],
      action: "J-Quants財務諸表の取得対象、最新決算のパース、欠損時warningを確認する。",
      safety: "財務品質が欠ける候補は高品質候補にしない。",
    });
  }

  if (primaryReviewCount / total < 0.8 || primaryFetchErrors > 0) {
    pushProposal(proposals, {
      priority: "S",
      title: "一次情報レビューの接続と取得エラーを確認する",
      reason: "TDnet/EDINETが欠けると、ニュースやSNSに引っ張られる危険が上がります。",
      evidence: [`primaryReview=${primaryReviewCount}/${total} (${pct(primaryReviewCount, total)})`, `fetchErrors=${primaryFetchErrors}`],
      action: "TDnet取得、EDINET直近営業日取得、sourceCoverageの記録を確認する。",
      safety: "一次情報取得エラー時はconfirmed扱いにしない。",
    });
  }

  if (primaryMissing > primaryBlock && primaryMissing / total > 0.5) {
    pushProposal(proposals, {
      priority: "A",
      title: "一次情報missingが多い候補を弱める",
      reason: "公式開示で裏取りできない材料は、調査候補としては残しても通知強度を上げにくいです。",
      evidence: [`primaryMissing=${primaryMissing}/${total} (${pct(primaryMissing, total)})`, `一次情報warning=${primaryWarnings}`],
      action: "missing候補は公式IR確認をnextStepsに出し、urgent昇格を抑制する条件を追加検討する。",
      safety: "missingは買い材料ではなく仮説扱いに固定する。",
    });
  }

  const weakRules = ruleDiagnostics.filter(rule => ["delete_candidate", "condition_required", "weaken_candidate"].includes(rule.diagnosis));
  if (weakRules.length > 0) {
    pushProposal(proposals, {
      priority: "A",
      title: "弱いルール候補を手動レビューする",
      reason: "過去の答え合わせで弱いルールは、スコア加点を続けるほど過学習・誤通知の原因になります。",
      evidence: weakRules.slice(0, 5).map(rule => `${rule.rule}: ${rule.diagnosis}, exp=${rule.directionExpectation.toFixed(2)}, avgRelative=${fmtPct(rule.avgRelativeReturnPct)}`),
      action: "自動削除はせず、追加条件・減点・ログ専用化の順で人間レビューする。",
      safety: "件数不足のルールは削除せず、needs_more_dataとして保留する。",
    });
  }

  if (expertBlocks / total > 0.3 || riskRejects / total > 0.3) {
    pushProposal(proposals, {
      priority: "B",
      title: "専門家合議・調査前レビューのblock理由を分類する",
      reason: "blockが多すぎる場合、候補の質が低いのか、しきい値が厳しすぎるのかを分ける必要があります。",
      evidence: [`expertBlocks=${expertBlocks}/${total}`, `riskRejects=${riskRejects}/${total}`],
      action: "block理由を頻出順に見て、流動性・過熱・財務品質・一次情報のどこが主因か分ける。",
      safety: "block理由が妥当なら通知抑制を維持する。しきい値緩和を急がない。",
    });
  }

  if (dataPartial / total > 0.5 && proposals.length < 4) {
    pushProposal(proposals, {
      priority: "B",
      title: "partialデータを前提にした提案の信頼度を下げる",
      reason: "partialが多い日は、改善提案もデータ欠損に引っ張られる可能性があります。",
      evidence: [`dataQuality partial=${dataPartial}/${total} (${pct(dataPartial, total)})`],
      action: "source_health を見て、欠損が外部API由来か、パース由来か、銘柄設定由来かを分ける。",
      safety: "partial日の提案は即実装せず、翌日以降も再発するか確認する。",
    });
  }

  if (proposals.length === 0) {
    pushProposal(proposals, {
      priority: "Hold",
      title: "大きな構造問題は未検出。ログ蓄積を優先する",
      reason: "現時点では情報源・ルール診断・pipelineに大きな異常が見えていません。",
      evidence: [`scores=${total}`, `primaryReview=${primaryReviewCount}`, `marketContext=${marketContextCount}`, `financialQuality=${financialQualityCount}`],
      action: "新機能追加より、1日/1週/1か月レビューの蓄積を優先する。",
      safety: "件数不足でしきい値を動かさない。",
    });
  }

  return proposals.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

function renderMarkdown(date: string, proposals: Proposal[]): string {
  const lines: string[] = [];
  lines.push("# alpha-pon 改善提案レポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> source health / rule diagnostics / score logs を統合して、次にやるべき改善を優先度つきで出します。");
  lines.push("> 買い推奨ではありません。運用改善・検証品質向上のための提案です。");
  lines.push("");

  for (const priority of ["S", "A", "B", "Hold"] as const) {
    const rows = proposals.filter(proposal => proposal.priority === priority);
    if (rows.length === 0) continue;
    lines.push(`## ${priority} 優先度`);
    lines.push("");
    for (const proposal of rows) {
      lines.push(`### ${proposal.title}`);
      lines.push(`- 理由: ${proposal.reason}`);
      lines.push(`- 対応: ${proposal.action}`);
      lines.push(`- 安全策: ${proposal.safety}`);
      lines.push("- 根拠:");
      proposal.evidence.forEach(item => lines.push(`  - ${item}`));
      lines.push("");
    }
  }

  lines.push("## 運用ルール");
  lines.push("");
  lines.push("- S優先度は次回実装・設定確認の最優先候補");
  lines.push("- A優先度はログが続いたら実装検討");
  lines.push("- B優先度はレポート監視・手動確認");
  lines.push("- Holdは件数不足。自動変更しない");
  lines.push("- どの提案も買い推奨ではなく、調査・検証・運用品質改善に限定する");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon proposals | ${date} | ※買い推奨ではありません*`);
  return lines.join("\n");
}

function main() {
  const date = todayJst();
  const scores = readProposalScores<ScoreLogEntry>("reports", date).rows;
  const pipeline = readJson<PipelineStatus>("reports/pipeline_status_latest.json");
  const ruleDiagnostics = readJson<RuleDiagnostic[]>("reports/rule_diagnostics_latest.json") ?? [];
  const proposals = buildProposals({ pipeline, scores, ruleDiagnostics });

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `proposals_${date}.json`), JSON.stringify(proposals, null, 2), "utf-8");
  writeFileSync(join("reports", "proposals_latest.json"), JSON.stringify(proposals, null, 2), "utf-8");
  writeFileSync(join("reports", `proposals_${date}.md`), renderMarkdown(date, proposals), "utf-8");
  writeFileSync(join("reports", "proposals_latest.md"), renderMarkdown(date, proposals), "utf-8");
  console.log(`レポート: reports/proposals_${date}.md`);
}

main();