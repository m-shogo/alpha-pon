import { existsSync, readFileSync } from "fs";
import { DatabaseSync } from "node:sqlite";
import {
  isUsableHypothesisOutcomeInput,
  parseHypothesisOutcomeSqlitePayloads,
} from "./hypothesis-outcome-input.js";
import type { HypothesisOutcome } from "./universe.js";

export type OutcomeDuplicate = {
  key: string;
  code: string;
  detectedAt: string;
  reviewHorizon: string;
  count: number;
};

export type JsonlParseError = {
  lineNumber: number;
  preview: string;
  message: string;
};

export type OutcomeIntegrityReport = {
  generatedAt: string;
  jsonl: {
    path: string;
    exists: boolean;
    totalRows: number;
    duplicateGroups: OutcomeDuplicate[];
    parseErrors: JsonlParseError[];
  };
  sqlite: {
    path: string;
    exists: boolean;
    totalRows: number | null;
    uniqueIndexExists: boolean;
    duplicateGroups: OutcomeDuplicate[];
    invalidPayloadRows: number;
    error: string | null;
  };
  status: "ok" | "duplicate_found" | "db_unavailable" | "parse_error";
  nextAction: string;
  notes: string[];
};

export function isBlockingOutcomeIntegrityStatus(status: OutcomeIntegrityReport["status"]): boolean {
  return status !== "ok";
}

function readJsonlSafely<T>(
  path: string,
  isUsable?: (value: unknown) => value is T,
): { rows: T[]; parseErrors: JsonlParseError[] } {
  if (!existsSync(path)) return { rows: [], parseErrors: [] };
  const rows: T[] = [];
  const parseErrors: JsonlParseError[] = [];
  const lines = readFileSync(path, "utf-8").split("\n");
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isUsable && !isUsable(parsed)) {
        parseErrors.push({
          lineNumber: index + 1,
          preview: "[invalid outcome shape]",
          message: "invalid hypothesis outcome shape",
        });
        return;
      }
      rows.push(parsed as T);
    } catch (error) {
      parseErrors.push({
        lineNumber: index + 1,
        preview: trimmed.slice(0, 160),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return { rows, parseErrors };
}

function duplicateGroupsFromOutcomes(outcomes: HypothesisOutcome[]): OutcomeDuplicate[] {
  const groups = new Map<string, OutcomeDuplicate>();
  for (const outcome of outcomes) {
    const detectedAt = outcome.hypothesis?.detectedAt ?? "";
    const reviewHorizon = outcome.reviewHorizon ?? "1m";
    const key = `${outcome.code}:${detectedAt}:${reviewHorizon}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        key,
        code: outcome.code,
        detectedAt,
        reviewHorizon,
        count: 1,
      });
    }
  }
  return [...groups.values()].filter(group => group.count > 1);
}

function duplicateGroupsFromDb(db: DatabaseSync): OutcomeDuplicate[] {
  return db.prepare(`
    SELECT
      code,
      detected_at as detectedAt,
      review_horizon as reviewHorizon,
      COUNT(*) as count
    FROM hypothesis_outcomes
    GROUP BY code, detected_at, review_horizon
    HAVING COUNT(*) > 1
    ORDER BY count DESC, code ASC, detected_at ASC, review_horizon ASC
  `).all() as OutcomeDuplicate[];
}

function hasUniqueIndex(db: DatabaseSync): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='index'
      AND name='idx_hypothesis_outcomes_unique'
  `).get() as { name: string } | undefined;
  return Boolean(row);
}

export function buildOutcomeIntegrityReport(params: {
  generatedAt: string;
  jsonlPath?: string;
  dbPath?: string;
}): OutcomeIntegrityReport {
  const jsonlPath = params.jsonlPath ?? "data/hypothesis_outcomes.jsonl";
  const dbPath = params.dbPath ?? "data/hypothesis_outcomes.db";
  const jsonlExists = existsSync(jsonlPath);
  const { rows: jsonlOutcomes, parseErrors } = readJsonlSafely<HypothesisOutcome>(
    jsonlPath,
    isUsableHypothesisOutcomeInput,
  );
  const jsonlDuplicates = duplicateGroupsFromOutcomes(jsonlOutcomes);

  let sqlite: OutcomeIntegrityReport["sqlite"] = {
    path: dbPath,
    exists: existsSync(dbPath),
    totalRows: null,
    uniqueIndexExists: false,
    duplicateGroups: [],
    invalidPayloadRows: 0,
    error: null,
  };

  if (sqlite.exists) {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(dbPath);
      const totalRows = (db.prepare("SELECT COUNT(*) as n FROM hypothesis_outcomes").get() as { n: number }).n;
      const payloadRows = db.prepare("SELECT payload FROM hypothesis_outcomes ORDER BY id").all() as { payload: string }[];
      const parsedPayloads = parseHypothesisOutcomeSqlitePayloads(payloadRows.map(row => row.payload), dbPath);
      sqlite = {
        ...sqlite,
        totalRows,
        uniqueIndexExists: hasUniqueIndex(db),
        duplicateGroups: duplicateGroupsFromDb(db),
        invalidPayloadRows: totalRows - parsedPayloads.rows.length,
      };
    } catch (error) {
      sqlite = {
        ...sqlite,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      db?.close();
    }
  }

  const hasDuplicates = jsonlDuplicates.length > 0 || sqlite.duplicateGroups.length > 0;
  const hasParseErrors = parseErrors.length > 0 || sqlite.invalidPayloadRows > 0;
  const dbUnavailable = sqlite.exists && sqlite.error != null;
  const status: OutcomeIntegrityReport["status"] = hasDuplicates
    ? "duplicate_found"
    : hasParseErrors
    ? "parse_error"
    : dbUnavailable
    ? "db_unavailable"
    : "ok";

  return {
    generatedAt: params.generatedAt,
    jsonl: {
      path: jsonlPath,
      exists: jsonlExists,
      totalRows: jsonlOutcomes.length,
      duplicateGroups: jsonlDuplicates,
      parseErrors,
    },
    sqlite,
    status,
    nextAction: hasDuplicates
      ? "重複行を自動削除せず、対象 key を確認して手動整理後に pnpm review:hypotheses を再実行"
      : sqlite.invalidPayloadRows > 0
      ? "SQLite payload の破損recordを自動削除せず、DBをローカルで確認して手動修正後に pnpm outcomes:integrity を再実行"
      : hasParseErrors
      ? "JSONL の破損行を自動削除せず、reports/hypothesis_outcome_integrity_latest.json の lineNumber を確認して手動修正"
      : sqlite.exists && !sqlite.uniqueIndexExists
      ? "pnpm review:hypotheses で DB schema を初期化し UNIQUE INDEX を確認"
      : "追加対応なし。code + detectedAt + reviewHorizon の単位で重複なし",
    notes: [
      "この診断は既存データを削除しません。",
      "1d / 1w / 1m / 3m は reviewHorizon が異なるため別 outcome として扱います。",
      "DB 側 UNIQUE INDEX は code, detected_at, review_horizon の同一組み合わせだけを防止します。",
      "SQLite payload はreview:hypothesesと同じusable Outcome shapeでread-only検証します。",
    ],
  };
}