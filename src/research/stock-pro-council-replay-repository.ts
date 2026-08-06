import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  COUNCIL_LEDGER_PATHS,
  parseCouncilLedgerJsonl,
  type CouncilDissentRecord,
  type CouncilVetoRecord,
} from "./stock-pro-council-ledgers.js";
import {
  buildCouncilReplayResult,
  hashPersonaVerdict,
  validateCouncilReplayPackage,
  type CouncilReplayManifest,
  type CouncilReplayPackage,
  type CouncilReplayResult,
  type CouncilReplaySchemas,
} from "./stock-pro-council-replay.js";
import {
  STOCK_PRO_COUNCIL_V2_PATHS,
  loadCouncilSchema,
  loadCouncilYaml,
  validateRepositoryStockProCouncilV2,
  type CouncilIssue,
  type PersonaVerdict,
  type StockProCouncilV2Catalog,
} from "./stock-pro-council-v2-validation.js";
import {
  PERSONA_CALIBRATION_PATHS,
  parsePersonaCalibrationJsonl,
  type PersonaCalibrationRecord,
} from "./stock-pro-council-calibration.js";
import {
  buildCalibrationAwareCouncilReplayResult,
  validateCalibrationAwareCouncilReplayPackage,
  type CalibrationAwareCouncilReplayPackage,
} from "./stock-pro-council-replay-calibration.js";
import { validate, type JsonSchema } from "./schema.js";

export const COUNCIL_REPLAY_PATHS = {
  manifestDir: "research/council_replays",
  manifestSchema: "research/schemas/council-replay-manifest.schema.json",
  resultSchema: "research/schemas/council-replay-result.schema.json",
} as const;

export type CouncilReplayRepositoryOptions = {
  manifestDir?: string;
  verdictDir?: string;
  dissentPath?: string;
  vetoPath?: string;
  // 指定するとcalibration-aware検証(manifest.calibrationHashesとcalibration台帳の照合)を有効化する。
  // 未指定なら従来どおりcalibrationを参照しないreplay検証のみを行う。
  calibrationDir?: string;
};

export type CouncilReplayRepositoryResult = {
  issues: CouncilIssue[];
  replayCount: number;
  eligibleCount: number;
  blockedCount: number;
  results: CouncilReplayResult[];
};

function sortIssues(issues: CouncilIssue[]): CouncilIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function issue(code: string, target: string, message: string): CouncilIssue {
  return { severity: "error", code, target, message };
}

function schemaIssues(value: unknown, schema: JsonSchema, target: string): CouncilIssue[] {
  return validate(value, schema).map((error) => ({
    severity: "error",
    code: "schema_violation",
    target: error.path ? `${target}:${error.path}` : target,
    message: error.message,
  }));
}

function readStrictJsonl<T>(path: string): { records: T[]; issues: CouncilIssue[] } {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue("partial_jsonl_tail", path, "final newlineがなくpartial writeの可能性があります")],
    };
  }
  try {
    return { records: parseCouncilLedgerJsonl<T>(content, path), issues: [] };
  } catch (error) {
    return { records: [], issues: [issue("invalid_jsonl", path, (error as Error).message)] };
  }
}

function readAllVerdicts(dir: string): { records: PersonaVerdict[]; issues: CouncilIssue[] } {
  if (!existsSync(dir)) return { records: [], issues: [] };
  const records: PersonaVerdict[] = [];
  const issues: CouncilIssue[] = [];
  for (const filename of readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()) {
    const result = readStrictJsonl<PersonaVerdict>(join(dir, filename));
    records.push(...result.records);
    issues.push(...result.issues);
  }
  return { records, issues };
}

function readAllCalibrations(
  dir: string,
): { records: PersonaCalibrationRecord[]; issues: CouncilIssue[] } {
  if (!existsSync(dir)) return { records: [], issues: [] };
  const records: PersonaCalibrationRecord[] = [];
  const issues: CouncilIssue[] = [];
  for (const filename of readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()) {
    const path = join(dir, filename);
    const content = readFileSync(path, "utf-8");
    if (content.length > 0 && !content.endsWith("\n")) {
      issues.push(issue("partial_calibration_tail", path, "final newlineがなくpartial writeの可能性があります"));
      continue;
    }
    try {
      records.push(...parsePersonaCalibrationJsonl(content, path));
    } catch (error) {
      issues.push(issue("invalid_calibration_jsonl", path, (error as Error).message));
    }
  }
  return { records, issues };
}

function readManifests(
  dir: string,
  schema: JsonSchema,
): { manifests: CouncilReplayManifest[]; issues: CouncilIssue[] } {
  if (!existsSync(dir)) return { manifests: [], issues: [] };
  const manifests: CouncilReplayManifest[] = [];
  const issues: CouncilIssue[] = [];
  for (const filename of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const path = join(dir, filename);
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    } catch (error) {
      issues.push(issue("invalid_replay_manifest_json", path, (error as Error).message));
      continue;
    }
    const errors = schemaIssues(value, schema, path);
    if (errors.length > 0) {
      issues.push(...errors);
      continue;
    }
    manifests.push(value as CouncilReplayManifest);
  }
  return { manifests, issues };
}

function schemas(): CouncilReplaySchemas {
  return {
    manifest: loadCouncilSchema(COUNCIL_REPLAY_PATHS.manifestSchema),
    result: loadCouncilSchema(COUNCIL_REPLAY_PATHS.resultSchema),
    verdict: loadCouncilSchema(STOCK_PRO_COUNCIL_V2_PATHS.verdictSchema),
    dissent: loadCouncilSchema(COUNCIL_LEDGER_PATHS.dissentSchema),
    veto: loadCouncilSchema(COUNCIL_LEDGER_PATHS.vetoSchema),
  };
}

function duplicateManifestIssues(manifests: CouncilReplayManifest[]): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  const check = (values: string[], code: string, label: string): void => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    for (const [value, count] of counts) {
      if (count > 1) issues.push(issue(code, value, `${label}が${count}件重複しています`));
    }
  };
  check(manifests.map((manifest) => manifest.replayId), "duplicate_replay_id", "replayId");
  check(manifests.map((manifest) => manifest.contentHash), "duplicate_replay_manifest_hash", "manifest hash");
  return issues;
}

export function validateCouncilReplayRepository(
  options: CouncilReplayRepositoryOptions = {},
): CouncilReplayRepositoryResult {
  const manifestDir = options.manifestDir ?? COUNCIL_REPLAY_PATHS.manifestDir;
  const verdictDir = options.verdictDir ?? STOCK_PRO_COUNCIL_V2_PATHS.verdictDir;
  const dissentPath = options.dissentPath ?? COUNCIL_LEDGER_PATHS.dissent;
  const vetoPath = options.vetoPath ?? COUNCIL_LEDGER_PATHS.veto;
  const council = validateRepositoryStockProCouncilV2();
  const issues: CouncilIssue[] = [...council.catalogIssues];
  if (!council.catalog) {
    return { issues: sortIssues(issues), replayCount: 0, eligibleCount: 0, blockedCount: 0, results: [] };
  }

  const catalog = loadCouncilYaml(STOCK_PRO_COUNCIL_V2_PATHS.catalog) as StockProCouncilV2Catalog;
  const replaySchemas = schemas();
  const manifestRead = readManifests(manifestDir, replaySchemas.manifest);
  const verdictRead = readAllVerdicts(verdictDir);
  const dissentRead = readStrictJsonl<CouncilDissentRecord>(dissentPath);
  const vetoRead = readStrictJsonl<CouncilVetoRecord>(vetoPath);
  issues.push(
    ...manifestRead.issues,
    ...verdictRead.issues,
    ...dissentRead.issues,
    ...vetoRead.issues,
    ...duplicateManifestIssues(manifestRead.manifests),
  );

  const verdictByHash = new Map(verdictRead.records.map((record) => [hashPersonaVerdict(record), record]));
  const dissentByHash = new Map(dissentRead.records.map((record) => [record.contentHash, record]));
  const vetoByHash = new Map(vetoRead.records.map((record) => [record.contentHash, record]));

  // calibrationDirが渡された場合のみcalibration-aware検証を有効化する。
  // manifest.calibrationHashesとcalibration台帳を突き合わせ、hash集合不一致・manifest後calibration混入を
  // structural errorとして検出する。未指定なら従来のcalibration非参照replay検証のみを行う。
  const calibrationAware = options.calibrationDir !== undefined;
  const calibrationRead = calibrationAware
    ? readAllCalibrations(options.calibrationDir ?? PERSONA_CALIBRATION_PATHS.dir)
    : { records: [] as PersonaCalibrationRecord[], issues: [] as CouncilIssue[] };
  const calibrationSchema = calibrationAware
    ? loadCouncilSchema(PERSONA_CALIBRATION_PATHS.schema)
    : undefined;
  const calibrationByHash = new Map(
    calibrationRead.records.map((record) => [record.contentHash, record]),
  );
  if (calibrationAware) issues.push(...calibrationRead.issues);

  const results: CouncilReplayResult[] = [];

  for (const manifest of manifestRead.manifests) {
    const pkg: CouncilReplayPackage = {
      manifest,
      verdicts: manifest.verdictHashes.flatMap((hash) => {
        const record = verdictByHash.get(hash);
        return record ? [record] : [];
      }),
      dissent: manifest.dissentHashes.flatMap((hash) => {
        const record = dissentByHash.get(hash);
        return record ? [record] : [];
      }),
      veto: manifest.vetoHashes.flatMap((hash) => {
        const record = vetoByHash.get(hash);
        return record ? [record] : [];
      }),
    };

    if (calibrationAware && calibrationSchema) {
      const awarePkg: CalibrationAwareCouncilReplayPackage = {
        ...pkg,
        calibrations: manifest.calibrationHashes.flatMap((hash) => {
          const record = calibrationByHash.get(hash);
          return record ? [record] : [];
        }),
      };
      const packageIssues = validateCalibrationAwareCouncilReplayPackage(
        awarePkg,
        replaySchemas,
        calibrationSchema,
        catalog,
      );
      issues.push(...packageIssues);
      if (packageIssues.some((item) => item.severity === "error")) continue;
      try {
        results.push(buildCalibrationAwareCouncilReplayResult(
          awarePkg,
          replaySchemas,
          calibrationSchema,
          catalog,
        ));
      } catch (error) {
        issues.push(issue("replay_build_failed", manifest.replayId, (error as Error).message));
      }
      continue;
    }

    const packageIssues = validateCouncilReplayPackage(pkg, replaySchemas, catalog);
    issues.push(...packageIssues);
    if (packageIssues.some((item) => item.severity === "error")) continue;
    try {
      results.push(buildCouncilReplayResult(pkg, replaySchemas, catalog));
    } catch (error) {
      issues.push(issue("replay_build_failed", manifest.replayId, (error as Error).message));
    }
  }

  return {
    issues: sortIssues(issues),
    replayCount: manifestRead.manifests.length,
    eligibleCount: results.filter((result) => result.eligibleForRecommendationCandidate).length,
    blockedCount: results.filter((result) => !result.eligibleForRecommendationCandidate).length,
    results: results.sort((a, b) => a.replayId.localeCompare(b.replayId)),
  };
}
