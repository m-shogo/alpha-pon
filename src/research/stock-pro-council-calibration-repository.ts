import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PERSONA_CALIBRATION_PATHS,
  activePersonaCalibrationHeads,
  parsePersonaCalibrationJsonl,
  validatePersonaCalibrationLedger,
  type PersonaCalibrationRecord,
} from "./stock-pro-council-calibration.js";
import {
  STOCK_PRO_COUNCIL_V2_PATHS,
  loadCouncilSchema,
  loadCouncilYaml,
  validateRepositoryStockProCouncilV2,
  type CouncilIssue,
  type StockProCouncilV2Catalog,
} from "./stock-pro-council-v2-validation.js";

export type PersonaCalibrationRepositoryOptions = {
  dir?: string;
};

export type PersonaCalibrationRepositoryResult = {
  issues: CouncilIssue[];
  calibrationCount: number;
  activeHeadCount: number;
  eligibleHeadCount: number;
  records: PersonaCalibrationRecord[];
};

function issue(code: string, target: string, message: string): CouncilIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: CouncilIssue[]): CouncilIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function readCalibrationFile(path: string): {
  records: PersonaCalibrationRecord[];
  issues: CouncilIssue[];
} {
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue(
        "partial_calibration_tail",
        path,
        "final newlineがなくpartial writeの可能性があります",
      )],
    };
  }
  try {
    return {
      records: parsePersonaCalibrationJsonl(content, path),
      issues: [],
    };
  } catch (error) {
    return {
      records: [],
      issues: [issue("invalid_calibration_jsonl", path, (error as Error).message)],
    };
  }
}

export function validatePersonaCalibrationRepository(
  options: PersonaCalibrationRepositoryOptions = {},
): PersonaCalibrationRepositoryResult {
  const dir = options.dir ?? PERSONA_CALIBRATION_PATHS.dir;
  const council = validateRepositoryStockProCouncilV2();
  const issues: CouncilIssue[] = [...council.catalogIssues];
  if (!council.catalog) {
    return {
      issues: sortIssues(issues),
      calibrationCount: 0,
      activeHeadCount: 0,
      eligibleHeadCount: 0,
      records: [],
    };
  }

  const catalog = loadCouncilYaml(
    STOCK_PRO_COUNCIL_V2_PATHS.catalog,
  ) as StockProCouncilV2Catalog;
  const schema = loadCouncilSchema(PERSONA_CALIBRATION_PATHS.schema);
  const records: PersonaCalibrationRecord[] = [];

  if (existsSync(dir)) {
    for (const filename of readdirSync(dir)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()) {
      const path = join(dir, filename);
      const result = readCalibrationFile(path);
      records.push(...result.records);
      issues.push(...result.issues);
    }
  }

  issues.push(...validatePersonaCalibrationLedger(records, schema, catalog));
  const activeHeads = activePersonaCalibrationHeads(records);
  const eligibleHeads = activeHeads.filter((record) =>
    record.status === "eligible" && record.eligibleForConfidence,
  );

  return {
    issues: sortIssues(issues),
    calibrationCount: records.length,
    activeHeadCount: activeHeads.length,
    eligibleHeadCount: eligibleHeads.length,
    records,
  };
}
