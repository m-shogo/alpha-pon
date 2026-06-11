// 運用司令塔 v1 — ops-dashboard の純粋ロジック
// 入力（既存の生成物・レポート）から統合サマリーを組み立てる。
// IO は scripts/report-ops-dashboard.ts 側で行い、ここはテスト可能な純関数のみ。
//
// 出力の語彙は安全表現に限定する: 調査候補 / 監視対象 / 追加調査 / 保留 / 未評価 /
// 反証条件 / データ不足 / 確認対象。売買の推奨は出さない。

export type OpsSeverity = "urgent" | "attention" | "info";
export type OpsHealthStatus = "ok" | "needs_attention" | "action_required";

export interface OpsIssue {
  severity: OpsSeverity;
  category:
    | "pipeline"
    | "ui_data"
    | "outcome"
    | "data_availability"
    | "stale_fallback"
    | "safe_wording"
    | "special_situation"
    | "integrity";
  title: string;
  detail: string;
  command?: string;
}

export interface OpsNextCommand {
  command: string;
  reason: string;
}

export interface SafeWordingFinding {
  file: string;
  line: number;
  maskedPattern: string;
}

export interface OpsDashboard {
  schemaVersion: 1;
  generatedAt: string;
  healthStatus: OpsHealthStatus;
  priorityIssues: Array<OpsIssue & { rank: number }>;
  allIssues: OpsIssue[];
  outcomeAudit: {
    available: boolean;
    total: number;
    resultCounts: Record<string, number>;
    unevaluated: number;
    judgedWithLimitedData: Array<{ code: string; horizon: string; dataAvailability: string }>;
    reviewDue: {
      overdue: number;
      historicalSeedOverdue: number;
      dueToday: number;
      dueThisWeek: number;
    } | null;
    integrity: {
      status: string;
      jsonlDuplicateGroups: number;
      sqliteDuplicateGroups: number;
      parseErrors: number;
    } | null;
  };
  staleFallbackAudit: {
    universeScanStatus: string | null;
    universeFallbackReason: string | null;
    duplicatedWarningCodes: Array<{ code: string; duplicatedWarnings: string[] }>;
  };
  dataAvailabilityAudit: {
    outcomeCounts: Record<string, number>;
    qualityLevelCounts: Record<string, number>;
    nonOkCodes: string[];
  };
  safeWordingAudit: {
    scannedFiles: number;
    violations: SafeWordingFinding[];
  };
  pipelineAudit: {
    available: boolean;
    date: string | null;
    status: string | null;
    isToday: boolean;
    failedSteps: string[];
  };
  uiDataAudit: {
    available: boolean;
    generatedAt: string | null;
    isToday: boolean;
    metaWarnings: string[];
  };
  specialSituationAudit: {
    available: boolean;
    healthStatus: string | null;
    urgentTitles: string[];
    attentionTitles: string[];
  };
  nextSafeCommands: OpsNextCommand[];
  notes: string[];
}

// ── 安全表現チェック ──────────────────────────────────────────
// 注意: パターンを連結で組み立てるのは、tests/safe-wording.test.ts が
// ソース中の連続文字列を検査するため（自己検出の回避）。

const j = (...parts: string[]) => parts.join("");

export const OPS_FORBIDDEN_PATTERNS: string[] = [
  j("買い", "候補"),
  j("買うべ", "き"),
  j("売るべ", "き"),
  j("必ず上", "がる"),
  j("確実に上", "がる"),
  j("推奨銘", "柄"),
  j("今がチャン", "ス"),
  j("利益確", "実"),
];

const OPS_ALLOWED_LINES: string[] = [
  j("買い推奨ではな", "い"),
  j("売買を推奨しな", "い"),
  j("自動売買は行わな", "い"),
];

export function maskPattern(pattern: string): string {
  if (pattern.length <= 1) return pattern;
  return pattern[0] + "◯".repeat(pattern.length - 1);
}

export function findForbiddenWording(content: string, file: string): SafeWordingFinding[] {
  const findings: SafeWordingFinding[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (OPS_ALLOWED_LINES.some(ok => line.includes(ok))) continue;
    for (const pattern of OPS_FORBIDDEN_PATTERNS) {
      if (line.includes(pattern)) {
        findings.push({ file, line: i + 1, maskedPattern: maskPattern(pattern) });
      }
    }
  }
  return findings;
}

// ── 入力型（既存生成物の必要部分のみ） ───────────────────────

export interface OpsOutcomeLike {
  code?: string;
  reviewHorizon?: string;
  result?: string | null;
  dataAvailability?: string | null;
}

export interface OpsPipelineStatusLike {
  date?: string;
  status?: string;
  failedSteps?: string;
  steps?: Array<{ name?: string; status?: string }>;
}

export interface OpsSpecialOpsLike {
  healthStatus?: string;
  actionItems?: Array<{ priority?: string; title?: string; command?: string }>;
  reviewDue?: {
    overdue?: number;
    historicalSeedOverdue?: number;
    dueToday?: number;
    dueThisWeek?: number;
  };
}

export interface OpsIntegrityLike {
  status?: string;
  jsonl?: { duplicateGroups?: unknown[]; parseErrors?: unknown[] };
  sqlite?: { duplicateGroups?: unknown[] };
}

export interface OpsAlphaDataLike {
  generatedAt?: string | null;
  meta?: { warnings?: string[] } | null;
  universeScan?: { scanStatus?: string; fallbackReason?: string | null } | null;
  dataQualityByCode?: Record<string, { quality?: { level?: string } ; warnings?: string[] }>;
}

export interface OpsDashboardInputs {
  today: string;
  pipelineStatus: OpsPipelineStatusLike | null;
  alphaData: OpsAlphaDataLike | null;
  outcomes: OpsOutcomeLike[] | null;
  specialOps: OpsSpecialOpsLike | null;
  integrity: OpsIntegrityLike | null;
  safeWordingScannedFiles: number;
  safeWordingFindings: SafeWordingFinding[];
}

// ── 監査ロジック ─────────────────────────────────────────────

const SEVERITY_RANK: Record<OpsSeverity, number> = { urgent: 0, attention: 1, info: 2 };

function dateOnly(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  return value.slice(0, 10);
}

export function buildOpsDashboard(inputs: OpsDashboardInputs): OpsDashboard {
  const issues: OpsIssue[] = [];
  const { today } = inputs;

  // pipeline
  const pipeline = inputs.pipelineStatus;
  const pipelineDate = dateOnly(pipeline?.date);
  const failedSteps = [
    ...(pipeline?.steps ?? [])
      .filter(step => step.status && step.status !== "ok" && step.status !== "skipped")
      .map(step => step.name ?? "unknown"),
    ...(pipeline?.failedSteps ? pipeline.failedSteps.split(",").map(s => s.trim()).filter(Boolean) : []),
  ];
  const uniqueFailedSteps = [...new Set(failedSteps)];
  const pipelineAudit: OpsDashboard["pipelineAudit"] = {
    available: pipeline != null,
    date: pipelineDate,
    status: pipeline?.status ?? null,
    isToday: pipelineDate === today,
    failedSteps: uniqueFailedSteps,
  };
  if (!pipeline) {
    issues.push({
      severity: "attention",
      category: "pipeline",
      title: "pipeline_status が未生成",
      detail: "reports/pipeline_status_latest.json がありません。daily 実行履歴を確認してください。",
      command: "pnpm health",
    });
  } else if (uniqueFailedSteps.length > 0 || pipeline.status === "failed") {
    issues.push({
      severity: "urgent",
      category: "pipeline",
      title: `pipeline 失敗ステップ: ${uniqueFailedSteps.join(", ") || pipeline.status}`,
      detail: "daily パイプラインに失敗ステップがあります。ログを確認のうえ再実行を検討してください。",
      command: "pnpm daily",
    });
  } else if (!pipelineAudit.isToday) {
    issues.push({
      severity: "attention",
      category: "pipeline",
      title: `pipeline が本日未実行（最終: ${pipelineDate ?? "不明"}）`,
      detail: "本日分の daily パイプラインがまだ完了していません。",
      command: "pnpm daily",
    });
  }

  // ui data
  const alpha = inputs.alphaData;
  const uiGeneratedAt = dateOnly(alpha?.generatedAt);
  const metaWarnings = alpha?.meta?.warnings ?? [];
  const uiDataAudit: OpsDashboard["uiDataAudit"] = {
    available: alpha != null,
    generatedAt: uiGeneratedAt,
    isToday: uiGeneratedAt === today,
    metaWarnings,
  };
  if (!alpha) {
    issues.push({
      severity: "urgent",
      category: "ui_data",
      title: "UI 生成データが読み込めない",
      detail: "apps/web/public/generated/alpha-pon-data.json がないか壊れています。",
      command: "pnpm ui:data",
    });
  } else if (!uiDataAudit.isToday) {
    issues.push({
      severity: "attention",
      category: "ui_data",
      title: `UI 生成データが古い（generatedAt: ${uiGeneratedAt ?? "不明"}）`,
      detail: "alpha-pon-data.json が本日分に更新されていません。",
      command: "pnpm ui:data",
    });
  }
  if (metaWarnings.length > 0) {
    issues.push({
      severity: "attention",
      category: "ui_data",
      title: `UI 生成データに warning ${metaWarnings.length}件`,
      detail: metaWarnings.slice(0, 3).join(" / "),
      command: "pnpm ui:data",
    });
  }

  // stale fallback
  const universeScan = alpha?.universeScan ?? null;
  const duplicatedWarningCodes: Array<{ code: string; duplicatedWarnings: string[] }> = [];
  for (const [code, entry] of Object.entries(alpha?.dataQualityByCode ?? {})) {
    const warnings = entry?.warnings ?? [];
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const w of warnings) {
      if (seen.has(w)) dup.add(w);
      seen.add(w);
    }
    if (dup.size > 0) duplicatedWarningCodes.push({ code, duplicatedWarnings: [...dup] });
  }
  const staleFallbackAudit: OpsDashboard["staleFallbackAudit"] = {
    universeScanStatus: universeScan?.scanStatus ?? null,
    universeFallbackReason: universeScan?.fallbackReason ?? null,
    duplicatedWarningCodes,
  };
  if (universeScan?.fallbackReason) {
    issues.push({
      severity: "attention",
      category: "stale_fallback",
      title: `universe scan が fallback 動作（${universeScan.scanStatus ?? "不明"}）`,
      detail: `理由: ${universeScan.fallbackReason}`,
      command: "pnpm scan:universe",
    });
  }
  if (duplicatedWarningCodes.length > 0) {
    issues.push({
      severity: "attention",
      category: "stale_fallback",
      title: `warning 重複: ${duplicatedWarningCodes.length}銘柄`,
      detail: `${duplicatedWarningCodes.map(d => d.code).join(", ")} で同一 warning が重複記録されています。生成処理の重複を確認対象としてください。`,
      command: "pnpm ui:data",
    });
  }

  // outcomes / data availability
  const outcomes = inputs.outcomes ?? [];
  const resultCounts: Record<string, number> = {};
  const outcomeAvailabilityCounts: Record<string, number> = {};
  const judgedWithLimitedData: OpsDashboard["outcomeAudit"]["judgedWithLimitedData"] = [];
  for (const outcome of outcomes) {
    const result = outcome.result ?? "unevaluated";
    resultCounts[result] = (resultCounts[result] ?? 0) + 1;
    const availability = outcome.dataAvailability ?? "unknown";
    outcomeAvailabilityCounts[availability] = (outcomeAvailabilityCounts[availability] ?? 0) + 1;
    if ((result === "hit" || result === "miss") && availability !== "ok") {
      judgedWithLimitedData.push({
        code: outcome.code ?? "?",
        horizon: outcome.reviewHorizon ?? "?",
        dataAvailability: availability,
      });
    }
  }
  const unevaluated = (resultCounts["unknown"] ?? 0) + (resultCounts["unevaluated"] ?? 0);

  const integrity = inputs.integrity;
  const integrityAudit = integrity
    ? {
        status: integrity.status ?? "unknown",
        jsonlDuplicateGroups: integrity.jsonl?.duplicateGroups?.length ?? 0,
        sqliteDuplicateGroups: integrity.sqlite?.duplicateGroups?.length ?? 0,
        parseErrors: integrity.jsonl?.parseErrors?.length ?? 0,
      }
    : null;
  if (integrityAudit && integrityAudit.status !== "ok" && integrityAudit.status !== "unknown") {
    issues.push({
      severity: "urgent",
      category: "integrity",
      title: `outcome 整合性: ${integrityAudit.status}`,
      detail: `jsonl重複=${integrityAudit.jsonlDuplicateGroups}, sqlite重複=${integrityAudit.sqliteDuplicateGroups}, parse_error=${integrityAudit.parseErrors}`,
      command: "pnpm outcomes:integrity",
    });
  }

  const specialOps = inputs.specialOps;
  const reviewDue = specialOps?.reviewDue
    ? {
        overdue: specialOps.reviewDue.overdue ?? 0,
        historicalSeedOverdue: specialOps.reviewDue.historicalSeedOverdue ?? 0,
        dueToday: specialOps.reviewDue.dueToday ?? 0,
        dueThisWeek: specialOps.reviewDue.dueThisWeek ?? 0,
      }
    : null;
  if (reviewDue && reviewDue.overdue > 0) {
    issues.push({
      severity: "attention",
      category: "outcome",
      title: `outcome 採点期限超過: ${reviewDue.overdue}件`,
      detail: "horizon 期限を過ぎて未評価の outcome があります。価格データ反映後に dry-run で確認してください。",
      command: "pnpm backfill:special-outcomes",
    });
  }
  if (reviewDue && reviewDue.dueToday > 0) {
    issues.push({
      severity: "attention",
      category: "outcome",
      title: `本日採点期限: ${reviewDue.dueToday}件`,
      detail: "本日 horizon 期限を迎える outcome があります。",
      command: "pnpm review:special-due",
    });
  }
  if (judgedWithLimitedData.length > 0) {
    issues.push({
      severity: "attention",
      category: "data_availability",
      title: `データ不足のまま判定済み: ${judgedWithLimitedData.length}件`,
      detail: `${judgedWithLimitedData.map(item => `${item.code}(${item.horizon}/${item.dataAvailability})`).join(", ")} は dataAvailability が ok でないのに hit/miss 判定が入っています。誤判定の可能性があるため確認対象です。`,
      command: "pnpm outcomes:integrity",
    });
  }
  if (unevaluated > 0) {
    issues.push({
      severity: "info",
      category: "outcome",
      title: `未評価 outcome: ${unevaluated}件`,
      detail: "result が未確定の outcome です。期限到来後に自動評価されるものを含みます。",
      command: "pnpm review:special-due",
    });
  }

  // data availability summary
  const qualityLevelCounts: Record<string, number> = {};
  const nonOkCodes: string[] = [];
  for (const [code, entry] of Object.entries(alpha?.dataQualityByCode ?? {})) {
    const level = entry?.quality?.level ?? "unknown";
    qualityLevelCounts[level] = (qualityLevelCounts[level] ?? 0) + 1;
    if (level !== "ok") nonOkCodes.push(code);
  }
  if (nonOkCodes.length > 0) {
    issues.push({
      severity: "info",
      category: "data_availability",
      title: `データ品質 ok 以外: ${nonOkCodes.length}銘柄`,
      detail: `${nonOkCodes.slice(0, 10).join(", ")}${nonOkCodes.length > 10 ? " ほか" : ""} はデータ不足または部分データです。`,
      command: "pnpm maintain:data",
    });
  }

  // special situation
  const urgentTitles = (specialOps?.actionItems ?? [])
    .filter(item => item.priority === "urgent")
    .map(item => item.title ?? "");
  const attentionTitles = (specialOps?.actionItems ?? [])
    .filter(item => item.priority === "attention")
    .map(item => item.title ?? "");
  const specialSituationAudit: OpsDashboard["specialSituationAudit"] = {
    available: specialOps != null,
    healthStatus: specialOps?.healthStatus ?? null,
    urgentTitles,
    attentionTitles,
  };
  if (!specialOps) {
    issues.push({
      severity: "attention",
      category: "special_situation",
      title: "特殊状況ウォッチの ops summary が未生成",
      detail: "reports/special_situation_ops_summary_latest.json がありません。",
      command: "pnpm ops:special",
    });
  } else if (specialOps.healthStatus === "action_required") {
    const command = (specialOps.actionItems ?? []).find(item => item.priority === "urgent" && item.command)?.command;
    issues.push({
      severity: "urgent",
      category: "special_situation",
      title: `特殊状況ウォッチ: action_required（${urgentTitles.join(" / ") || "要対応あり"}）`,
      detail: "特殊状況ウォッチに緊急対応項目があります。",
      command: command ?? "pnpm ops:special",
    });
  } else if (specialOps.healthStatus === "needs_attention") {
    issues.push({
      severity: "attention",
      category: "special_situation",
      title: `特殊状況ウォッチ: needs_attention（${attentionTitles.join(" / ") || "確認事項あり"}）`,
      detail: "特殊状況ウォッチに確認対象があります。",
      command: "pnpm ops:special",
    });
  }

  // safe wording
  if (inputs.safeWordingFindings.length > 0) {
    issues.push({
      severity: "urgent",
      category: "safe_wording",
      title: `安全表現違反: ${inputs.safeWordingFindings.length}件`,
      detail: inputs.safeWordingFindings
        .slice(0, 5)
        .map(f => `${f.file}:${f.line} (${f.maskedPattern})`)
        .join(", "),
    });
  }

  // healthStatus / priority
  const sorted = [...issues].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const healthStatus: OpsHealthStatus = sorted.some(issue => issue.severity === "urgent")
    ? "action_required"
    : sorted.some(issue => issue.severity === "attention")
      ? "needs_attention"
      : "ok";
  const priorityIssues = sorted.slice(0, 5).map((issue, index) => ({ ...issue, rank: index + 1 }));

  // next safe commands（dry-run / 読み取り系のみ）
  const nextSafeCommands: OpsNextCommand[] = [];
  const seenCommands = new Set<string>();
  for (const issue of sorted) {
    if (!issue.command || seenCommands.has(issue.command)) continue;
    seenCommands.add(issue.command);
    nextSafeCommands.push({ command: issue.command, reason: issue.title });
  }
  for (const fallback of [
    { command: "pnpm health", reason: "全体ヘルスチェック" },
    { command: "pnpm report:ops", reason: "このダッシュボードの再生成" },
  ]) {
    if (!seenCommands.has(fallback.command)) {
      seenCommands.add(fallback.command);
      nextSafeCommands.push(fallback);
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: today,
    healthStatus,
    priorityIssues,
    allIssues: sorted,
    outcomeAudit: {
      available: inputs.outcomes != null,
      total: outcomes.length,
      resultCounts,
      unevaluated,
      judgedWithLimitedData,
      reviewDue,
      integrity: integrityAudit,
    },
    staleFallbackAudit,
    dataAvailabilityAudit: {
      outcomeCounts: outcomeAvailabilityCounts,
      qualityLevelCounts,
      nonOkCodes,
    },
    safeWordingAudit: {
      scannedFiles: inputs.safeWordingScannedFiles,
      violations: inputs.safeWordingFindings,
    },
    pipelineAudit,
    uiDataAudit,
    specialSituationAudit,
    nextSafeCommands,
    notes: [
      "この画面は調査・検証の運用状況を示すものであり、売買を推奨しない。",
      "判定は「未評価」「データ不足」「確認対象」を優先し、断定を避ける。",
      "情報源: pipeline_status / alpha-pon-data.json / outcomes.json / special_situation_ops_summary / hypothesis_outcome_integrity",
    ],
  };
}

// ── Markdown 出力 ────────────────────────────────────────────

const HEALTH_LABEL: Record<OpsHealthStatus, string> = {
  ok: "OK — 通常運用",
  needs_attention: "needs_attention — 確認対象あり",
  action_required: "action_required — 要対応",
};

const SEVERITY_LABEL: Record<OpsSeverity, string> = {
  urgent: "緊急",
  attention: "確認",
  info: "情報",
};

export function renderOpsDashboardMarkdown(dashboard: OpsDashboard): string {
  const lines: string[] = [];
  lines.push(`# alpha-pon 運用ダッシュボード (${dashboard.generatedAt})`);
  lines.push("");
  lines.push(`- healthStatus: **${HEALTH_LABEL[dashboard.healthStatus]}**`);
  lines.push("");

  lines.push("## 優先対応 TOP5");
  lines.push("");
  if (dashboard.priorityIssues.length === 0) {
    lines.push("- 対応が必要な項目はありません。");
  } else {
    for (const issue of dashboard.priorityIssues) {
      lines.push(`${issue.rank}. [${SEVERITY_LABEL[issue.severity]}] ${issue.title}`);
      lines.push(`   - ${issue.detail}`);
      if (issue.command) lines.push(`   - 次の安全コマンド: \`${issue.command}\``);
    }
  }
  lines.push("");

  lines.push("## 仮説レビュー状況");
  lines.push("");
  const oa = dashboard.outcomeAudit;
  lines.push(`- outcome 総数: ${oa.total}件`);
  for (const [result, count] of Object.entries(oa.resultCounts)) {
    lines.push(`  - ${result}: ${count}件`);
  }
  if (oa.reviewDue) {
    lines.push(`- 採点期限超過: ${oa.reviewDue.overdue}件（うち historical seed: ${oa.reviewDue.historicalSeedOverdue}件） / 本日期限: ${oa.reviewDue.dueToday}件 / 今週期限: ${oa.reviewDue.dueThisWeek}件`);
  }
  if (oa.judgedWithLimitedData.length > 0) {
    lines.push(`- データ不足のまま判定済み（確認対象）: ${oa.judgedWithLimitedData.map(item => item.code).join(", ")}`);
  }
  if (oa.integrity) {
    lines.push(`- 整合性: ${oa.integrity.status}（jsonl重複=${oa.integrity.jsonlDuplicateGroups}, sqlite重複=${oa.integrity.sqliteDuplicateGroups}, parse_error=${oa.integrity.parseErrors}）`);
  }
  lines.push("");

  lines.push("## データ品質");
  lines.push("");
  for (const [level, count] of Object.entries(dashboard.dataAvailabilityAudit.qualityLevelCounts)) {
    lines.push(`- 品質 ${level}: ${count}銘柄`);
  }
  if (dashboard.dataAvailabilityAudit.nonOkCodes.length > 0) {
    lines.push(`- データ不足/部分データ: ${dashboard.dataAvailabilityAudit.nonOkCodes.join(", ")}`);
  }
  if (dashboard.staleFallbackAudit.universeFallbackReason) {
    lines.push(`- universe scan fallback: ${dashboard.staleFallbackAudit.universeFallbackReason}`);
  }
  if (dashboard.staleFallbackAudit.duplicatedWarningCodes.length > 0) {
    lines.push(`- warning 重複: ${dashboard.staleFallbackAudit.duplicatedWarningCodes.map(d => d.code).join(", ")}`);
  }
  lines.push("");

  lines.push("## パイプライン / UI データ");
  lines.push("");
  lines.push(`- pipeline: ${dashboard.pipelineAudit.status ?? "不明"}（${dashboard.pipelineAudit.date ?? "日付不明"}${dashboard.pipelineAudit.isToday ? " / 本日分" : ""}）`);
  if (dashboard.pipelineAudit.failedSteps.length > 0) {
    lines.push(`- 失敗ステップ: ${dashboard.pipelineAudit.failedSteps.join(", ")}`);
  }
  lines.push(`- UI 生成データ: ${dashboard.uiDataAudit.generatedAt ?? "未生成"}${dashboard.uiDataAudit.isToday ? "（本日分）" : "（要更新）"}`);
  if (dashboard.uiDataAudit.metaWarnings.length > 0) {
    lines.push(`- UI meta warnings: ${dashboard.uiDataAudit.metaWarnings.join(" / ")}`);
  }
  lines.push("");

  lines.push("## 安全表現チェック");
  lines.push("");
  if (dashboard.safeWordingAudit.violations.length === 0) {
    lines.push(`- スキャン ${dashboard.safeWordingAudit.scannedFiles} ファイル、違反なし`);
  } else {
    lines.push(`- 違反 ${dashboard.safeWordingAudit.violations.length}件（要修正）`);
    for (const v of dashboard.safeWordingAudit.violations.slice(0, 10)) {
      lines.push(`  - ${v.file}:${v.line} (${v.maskedPattern})`);
    }
  }
  lines.push("");

  lines.push("## 次に実行する安全コマンド");
  lines.push("");
  for (const cmd of dashboard.nextSafeCommands) {
    lines.push(`- \`${cmd.command}\` — ${cmd.reason}`);
  }
  lines.push("");

  lines.push("## 注意");
  lines.push("");
  for (const note of dashboard.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}
