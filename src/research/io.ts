// Research OS — ファイル IO。パス定義・読み込み・Append Only 書き込みを一箇所に集約する。
// 純ロジック（queue / dashboard / gate など）はここを経由してのみディスクに触る。
// 既存リポジトリの慣例に合わせて、パスは process.cwd()（= リポジトリルート）基準。

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import type {
  Checkpoint,
  Confounder,
  Counterfactual,
  Edge,
  HistoricalAnalog,
  ResearchLogEntry,
  ResearchState,
} from "./types.js";
import { formatErrors, validate, type JsonSchema } from "./schema.js";

const ROOT = () => process.cwd();

export const paths = {
  root: () => join(ROOT(), "research"),
  schemas: () => join(ROOT(), "research", "schemas"),
  edges: () => join(ROOT(), "research", "edge_registry", "edges"),
  edgeIndex: () => join(ROOT(), "research", "edge_registry", "index.generated.json"),
  analogs: () => join(ROOT(), "research", "historical", "analogs"),
  counterfactuals: () => join(ROOT(), "research", "counterfactual", "counterfactuals.jsonl"),
  confounders: () => join(ROOT(), "research", "confounder", "confounders.jsonl"),
  researchLogDir: () => join(ROOT(), "research", "research_log"),
  researchLogFile: (yearMonth: string) => join(ROOT(), "research", "research_log", `${yearMonth}.jsonl`),
  checkpointLatest: () => join(ROOT(), "research", "checkpoint", "latest.json"),
  checkpointHistory: () => join(ROOT(), "research", "checkpoint", "history"),
  holdoutManifest: () => join(ROOT(), "research", "holdout", "vault.manifest.json"),
  holdoutAccessLog: () => join(ROOT(), "research", "holdout", "access_log.jsonl"),
  queueWeights: () => join(ROOT(), "research", "queue", "weights.yml"),
  queueOutput: () => join(ROOT(), "research", "queue", "queue.generated.json"),
  dashboard: () => join(ROOT(), "research", "dashboard", "dashboard.generated.md"),
  reports: () => join(ROOT(), "research", "reports"),
  fixtures: () => join(ROOT(), "research", "fixtures"),
};

export type SchemaName =
  | "edge"
  | "analog"
  | "counterfactual"
  | "confounder"
  | "research-log"
  | "checkpoint"
  | "backtest"
  | "holdout-manifest"
  | "holdout-access";

const schemaCache = new Map<SchemaName, JsonSchema>();

export function loadSchema(name: SchemaName): JsonSchema {
  const cached = schemaCache.get(name);
  if (cached) return cached;
  const parsed = JSON.parse(readFileSync(join(paths.schemas(), `${name}.schema.json`), "utf-8")) as JsonSchema;
  schemaCache.set(name, parsed);
  return parsed;
}

export class ResearchDataError extends Error {
  constructor(
    readonly file: string,
    readonly details: string,
  ) {
    super(`${file}\n${details}`);
    this.name = "ResearchDataError";
  }
}

function parseValidated<T>(raw: unknown, schema: SchemaName, file: string): T {
  const errors = validate(raw, loadSchema(schema));
  if (errors.length > 0) throw new ResearchDataError(file, formatErrors(errors));
  return raw as T;
}

function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .sort(); // 決定論的な読み込み順
}

export function readJsonl(file: string): unknown[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8")
    .split("\n")
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, index }) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new ResearchDataError(file, `  - ${index + 1} 行目: JSON として読めません`);
      }
    });
}

export function loadEdges(): Edge[] {
  return listFiles(paths.edges(), ".yml").map((name) => {
    const file = join(paths.edges(), name);
    const raw = load(readFileSync(file, "utf-8"));
    const edge = parseValidated<Edge>(raw, "edge", file);
    const expected = `${edge.id}.yml`;
    if (name !== expected) {
      throw new ResearchDataError(file, `  - ファイル名は id と一致させてください（期待: ${expected}）`);
    }
    return edge;
  });
}

export function loadAnalogs(): HistoricalAnalog[] {
  return listFiles(paths.analogs(), ".yml").map((name) => {
    const file = join(paths.analogs(), name);
    const raw = load(readFileSync(file, "utf-8"));
    const analog = parseValidated<HistoricalAnalog>(raw, "analog", file);
    const expected = `${analog.id}.yml`;
    if (name !== expected) {
      throw new ResearchDataError(file, `  - ファイル名は id と一致させてください（期待: ${expected}）`);
    }
    return analog;
  });
}

export function loadCounterfactuals(): Counterfactual[] {
  const file = paths.counterfactuals();
  return readJsonl(file).map((raw) => parseValidated<Counterfactual>(raw, "counterfactual", file));
}

export function loadConfounders(): Confounder[] {
  const file = paths.confounders();
  return readJsonl(file).map((raw) => parseValidated<Confounder>(raw, "confounder", file));
}

export function loadResearchLog(): ResearchLogEntry[] {
  return listFiles(paths.researchLogDir(), ".jsonl").flatMap((name) => {
    const file = join(paths.researchLogDir(), name);
    return readJsonl(file).map((raw) => parseValidated<ResearchLogEntry>(raw, "research-log", file));
  });
}

export function loadCheckpoint(): Checkpoint | null {
  const file = paths.checkpointLatest();
  if (!existsSync(file)) return null;
  return parseValidated<Checkpoint>(JSON.parse(readFileSync(file, "utf-8")), "checkpoint", file);
}

/** Queue / Dashboard / Gate 判定が使う唯一のスナップショット。 */
export function loadResearchState(): ResearchState {
  return {
    edges: loadEdges(),
    analogs: loadAnalogs(),
    counterfactuals: loadCounterfactuals(),
    confounders: loadConfounders(),
    checkpoint: loadCheckpoint(),
  };
}

// ---------------------------------------------------------------------------
// 書き込み
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** 既存ファイルを絶対に上書きしない。immutable なデータ（Analog / Checkpoint 履歴）用。 */
export function writeNewFile(file: string, content: string): void {
  if (existsSync(file)) {
    throw new Error(`既に存在するファイルは上書きできません（Research OS の不変条件）: ${file}`);
  }
  ensureDir(join(file, ".."));
  writeFileSync(file, content, "utf-8");
}

/** JSONL への追記。1行1レコード。既存行には触れない。 */
export function appendJsonl(file: string, record: unknown): void {
  ensureDir(join(file, ".."));
  appendFileSync(file, `${JSON.stringify(record)}\n`, "utf-8");
}

/** 生成物の書き出し。末尾に改行を必ず付け、差分を安定させる。 */
export function writeGenerated(file: string, content: string): void {
  ensureDir(join(file, ".."));
  writeFileSync(file, content.endsWith("\n") ? content : `${content}\n`, "utf-8");
}

export function writeGeneratedJson(file: string, value: unknown): void {
  writeGenerated(file, JSON.stringify(value, null, 2));
}
