// 仮説レビュー品質監査 v1 — 純粋ロジック
// 調査候補を出しっぱなしにせず、1d/1w/1m の答え合わせ品質を監査する。
// 見つけるもの: 未レビュー / horizon 欠け / データ不足のまま判定 /
// unknown 同士の一致扱い / 反省メモ未記入 / reviewDueAt と timeframe のズレ。
// IO は src/outcome-quality-audit-report.ts 側で行う。

export type OutcomeQualityHealth = "ok" | "needs_attention" | "action_required";

export interface OutcomeQualityFinding {
  code: string;
  name?: string;
  detectedAt?: string;
  horizon?: string;
  detail: string;
}

export interface OutcomeQualityCheck {
  count: number;
  items: OutcomeQualityFinding[];
}

export interface OutcomeQualityAudit {
  schemaVersion: 1;
  generatedAt: string;
  healthStatus: OutcomeQualityHealth;
  totals: {
    hypotheses: number;
    outcomes: number;
    groups: number;
  };
  checks: {
    reviewMissing: OutcomeQualityCheck;
    horizonGaps: OutcomeQualityCheck;
    judgedWithLimitedData: OutcomeQualityCheck;
    unknownMatchedAsHit: OutcomeQualityCheck;
    pendingWithSignals: OutcomeQualityCheck;
    emptyReviewNotes: OutcomeQualityCheck;
    dueAtMismatch: OutcomeQualityCheck;
  };
  notes: string[];
}

export interface QualityHypothesisLike {
  code?: string;
  name?: string;
  detectedAt?: string;
  reviewDueAt?: string;
  expectedTimeframe?: string;
  expectedDirection?: string;
}

export interface QualityOutcomeLike {
  code?: string;
  name?: string;
  reviewHorizon?: string;
  result?: string | null;
  dataAvailability?: string | null;
  actualDirection?: string | null;
  whatMatched?: string[] | null;
  missedSignals?: string[] | null;
  notes?: string | null;
  hypothesis?: QualityHypothesisLike | null;
}

export interface OutcomeQualityInputs {
  today: string;
  hypotheses: QualityHypothesisLike[];
  outcomes: QualityOutcomeLike[];
}

// ── 日付ユーティリティ ───────────────────────────────────────

function calendarDateUtcMs(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const utcMs = Date.UTC(year, month - 1, day);
  const parsed = new Date(utcMs);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;
  return utcMs;
}

function addDays(dateStr: string, days: number): string | null {
  const baseMs = calendarDateUtcMs(dateStr);
  if (baseMs == null) return null;
  const date = new Date(baseMs);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDays(fromStr: string, toStr: string): number | null {
  const from = calendarDateUtcMs(fromStr);
  const to = calendarDateUtcMs(toStr);
  if (from == null || to == null) return null;
  return Math.round((to - from) / 86400000);
}

// horizon ごとの期日（暦日）。営業日は使わず、週末分の猶予を GRACE_DAYS で吸収する。
const HORIZON_DAYS: Record<string, number> = { "1d": 1, "1w": 7, "1m": 30, "3m": 90 };
const REQUIRED_HORIZONS = ["1d", "1w", "1m"] as const;
const GRACE_DAYS = 3;

// reviewDueAt と expectedTimeframe の整合チェックに使う許容レンジ（暦日）
const DUE_TOLERANCE: Record<string, { min: number; max: number }> = {
  "1d": { min: 1, max: 4 },
  "1w": { min: 5, max: 11 },
  "1m": { min: 25, max: 35 },
  "3m": { min: 80, max: 100 },
};

function isDue(detectedAt: string, horizon: string, today: string): boolean {
  const days = HORIZON_DAYS[horizon];
  if (days == null) return false;
  if (calendarDateUtcMs(today) == null) return false;
  const due = addDays(detectedAt, days + GRACE_DAYS);
  return due != null && due <= today;
}

// ── 監査本体 ─────────────────────────────────────────────────

export function buildOutcomeQualityAudit(inputs: OutcomeQualityInputs): OutcomeQualityAudit {
  const { today } = inputs;
  const outcomes = inputs.outcomes ?? [];
  const hypotheses = inputs.hypotheses ?? [];

  // グループ化: code + detectedAt（同一仮説の horizon 群）
  const groups = new Map<string, QualityOutcomeLike[]>();
  for (const outcome of outcomes) {
    const detectedAt = outcome.hypothesis?.detectedAt ?? "?";
    const key = `${outcome.code ?? "?"}@${detectedAt}`;
    groups.set(key, [...(groups.get(key) ?? []), outcome]);
  }

  const reviewMissing: OutcomeQualityFinding[] = [];
  const horizonGaps: OutcomeQualityFinding[] = [];
  const judgedWithLimitedData: OutcomeQualityFinding[] = [];
  const unknownMatchedAsHit: OutcomeQualityFinding[] = [];
  const pendingWithSignals: OutcomeQualityFinding[] = [];
  const emptyReviewNotes: OutcomeQualityFinding[] = [];
  const dueAtMismatch: OutcomeQualityFinding[] = [];

  // 1. detectedAt があるのに review（outcome 記録）が一件もない
  for (const hypothesis of hypotheses) {
    const { code, detectedAt } = hypothesis;
    if (!code || !detectedAt) continue;
    if (!isDue(detectedAt, "1d", today)) continue; // 最初の期日前は正常待機
    if (!groups.has(`${code}@${detectedAt}`)) {
      reviewMissing.push({
        code,
        name: hypothesis.name,
        detectedAt,
        detail: `detectedAt=${detectedAt} の仮説に outcome 記録がありません（1d 期日超過）。`,
      });
    }
  }

  // 2. 期日が来ている horizon の記録が欠けている（1d/1w/1m）
  for (const [key, groupOutcomes] of groups) {
    const [code, detectedAt] = key.split("@");
    if (!detectedAt || detectedAt === "?") continue;
    const present = new Set(groupOutcomes.map(o => o.reviewHorizon));
    const missing = REQUIRED_HORIZONS.filter(h => !present.has(h) && isDue(detectedAt, h, today));
    if (missing.length > 0) {
      horizonGaps.push({
        code,
        name: groupOutcomes[0]?.name,
        detectedAt,
        detail: `期日超過の horizon が未記録: ${missing.join(", ")}`,
      });
    }
  }

  for (const outcome of outcomes) {
    const code = outcome.code ?? "?";
    const horizon = outcome.reviewHorizon ?? "?";
    const detectedAt = outcome.hypothesis?.detectedAt;
    const result = outcome.result ?? null;
    const judged = result === "hit" || result === "miss";

    // 3. dataAvailability !== ok なのに hit/miss 判定が入っている
    if (judged && outcome.dataAvailability !== "ok") {
      judgedWithLimitedData.push({
        code,
        name: outcome.name,
        detectedAt,
        horizon,
        detail: `dataAvailability=${outcome.dataAvailability ?? "unknown"} のまま result=${result}。誤判定の可能性があるため確認対象。`,
      });
    }

    // 4. unknown 同士を一致扱いしている
    const expectedDirection = outcome.hypothesis?.expectedDirection ?? "unknown";
    const actualDirection = outcome.actualDirection ?? "unknown";
    if (result === "hit" && expectedDirection === "unknown" && actualDirection === "unknown") {
      unknownMatchedAsHit.push({
        code,
        name: outcome.name,
        detectedAt,
        horizon,
        detail: "expected/actual とも unknown なのに hit 判定。精度集計を歪めるため未評価に戻す確認対象。",
      });
    }

    // 5. whatMatched が空でないのに未評価扱い
    if ((outcome.whatMatched?.length ?? 0) > 0 && (result == null || result === "unknown")) {
      pendingWithSignals.push({
        code,
        name: outcome.name,
        detectedAt,
        horizon,
        detail: `whatMatched が ${outcome.whatMatched!.length}件あるのに result が未評価のまま。`,
      });
    }

    // 6. 判定済みなのに notes / missedSignals が空（反省未記入）
    const notesEmpty = !outcome.notes || outcome.notes.trim() === "";
    const missedEmpty = (outcome.missedSignals?.length ?? 0) === 0;
    if ((judged || result === "invalidated") && notesEmpty && missedEmpty) {
      emptyReviewNotes.push({
        code,
        name: outcome.name,
        detectedAt,
        horizon,
        detail: `result=${result} なのに notes / missedSignals が空。次回に活きる反省を記入する確認対象。`,
      });
    }
  }

  // 7. reviewDueAt と expectedTimeframe がズレている
  for (const hypothesis of hypotheses) {
    const { code, detectedAt, reviewDueAt, expectedTimeframe } = hypothesis;
    if (!code || !detectedAt || !reviewDueAt || !expectedTimeframe) continue;
    const tolerance = DUE_TOLERANCE[expectedTimeframe];
    if (!tolerance) continue;
    const span = diffDays(detectedAt, reviewDueAt);
    if (span == null) continue;
    if (span < tolerance.min || span > tolerance.max) {
      dueAtMismatch.push({
        code,
        name: hypothesis.name,
        detectedAt,
        detail: `expectedTimeframe=${expectedTimeframe} に対し reviewDueAt まで ${span}日（許容 ${tolerance.min}〜${tolerance.max}日）。`,
      });
    }
  }

  const toCheck = (items: OutcomeQualityFinding[]): OutcomeQualityCheck => ({
    count: items.length,
    items,
  });

  const checks: OutcomeQualityAudit["checks"] = {
    reviewMissing: toCheck(reviewMissing),
    horizonGaps: toCheck(horizonGaps),
    judgedWithLimitedData: toCheck(judgedWithLimitedData),
    unknownMatchedAsHit: toCheck(unknownMatchedAsHit),
    pendingWithSignals: toCheck(pendingWithSignals),
    emptyReviewNotes: toCheck(emptyReviewNotes),
    dueAtMismatch: toCheck(dueAtMismatch),
  };

  // unknown 同士の hit は精度集計を直接歪めるため最優先
  const healthStatus: OutcomeQualityHealth =
    checks.unknownMatchedAsHit.count > 0
      ? "action_required"
      : Object.values(checks).some(check => check.count > 0)
        ? "needs_attention"
        : "ok";

  return {
    schemaVersion: 1,
    generatedAt: today,
    healthStatus,
    totals: {
      hypotheses: hypotheses.length,
      outcomes: outcomes.length,
      groups: groups.size,
    },
    checks,
    notes: [
      "この監査は答え合わせの品質確認であり、売買を推奨しない。",
      "horizon 期日は暦日 + 猶予3日で判定するため、休場直後は誤検知の可能性がある。",
      "stale fallback の warning 重複は ops dashboard（pnpm report:ops）側で監査する。",
    ],
  };
}

// ── Markdown 出力 ────────────────────────────────────────────

const CHECK_LABELS: Record<keyof OutcomeQualityAudit["checks"], string> = {
  reviewMissing: "未レビュー仮説（detectedAt あり・outcome 記録なし）",
  horizonGaps: "horizon 記録欠け（期日超過の 1d/1w/1m）",
  judgedWithLimitedData: "データ不足のまま判定済み",
  unknownMatchedAsHit: "unknown 同士の hit 判定（要修正）",
  pendingWithSignals: "whatMatched ありなのに未評価",
  emptyReviewNotes: "反省メモ未記入（notes / missedSignals 空）",
  dueAtMismatch: "reviewDueAt と timeframe のズレ",
};

const HEALTH_LABELS: Record<OutcomeQualityHealth, string> = {
  ok: "OK — 品質問題なし",
  needs_attention: "needs_attention — 確認対象あり",
  action_required: "action_required — 要対応",
};

export function renderOutcomeQualityMarkdown(audit: OutcomeQualityAudit): string {
  const lines: string[] = [];
  lines.push(`# 仮説レビュー品質監査 (${audit.generatedAt})`);
  lines.push("");
  lines.push(`- healthStatus: **${HEALTH_LABELS[audit.healthStatus]}**`);
  lines.push(`- 仮説: ${audit.totals.hypotheses}件 / outcome: ${audit.totals.outcomes}件 / 仮説グループ: ${audit.totals.groups}件`);
  lines.push("");
  lines.push("## チェック結果");
  lines.push("");
  for (const [key, label] of Object.entries(CHECK_LABELS) as Array<[keyof OutcomeQualityAudit["checks"], string]>) {
    const check = audit.checks[key];
    lines.push(`### ${label}: ${check.count}件`);
    lines.push("");
    if (check.count === 0) {
      lines.push("- なし");
    } else {
      for (const item of check.items.slice(0, 20)) {
        const head = [item.code, item.name, item.detectedAt, item.horizon].filter(Boolean).join(" / ");
        lines.push(`- ${head}: ${item.detail}`);
      }
      if (check.items.length > 20) lines.push(`- …ほか ${check.items.length - 20}件`);
    }
    lines.push("");
  }
  lines.push("## 注意");
  lines.push("");
  for (const note of audit.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines.join("\n");
}
