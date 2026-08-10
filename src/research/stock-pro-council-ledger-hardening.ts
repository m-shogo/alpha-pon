import { existsSync, readFileSync } from "node:fs";
import {
  COUNCIL_LEDGER_PATHS,
  parseCouncilLedgerJsonl,
  validateDissentLedger,
  validateVetoLedger,
  type CouncilDissentRecord,
  type CouncilVetoRecord,
} from "./stock-pro-council-ledgers.js";
import {
  STOCK_PRO_COUNCIL_V2_PATHS,
  loadCouncilSchema,
  loadCouncilYaml,
  validateRepositoryStockProCouncilV2,
  type CouncilIssue,
  type StockProCouncilV2Catalog,
} from "./stock-pro-council-v2-validation.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";

function sortIssues(issues: CouncilIssue[]): CouncilIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function readStrictLedger<T>(path: string): { records: T[]; issues: CouncilIssue[] } {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [{
        severity: "error",
        code: "partial_ledger_tail",
        target: path,
        message: "final newlineがなくpartial writeの可能性があります",
      }],
    };
  }
  try {
    return { records: parseCouncilLedgerJsonl<T>(content, path), issues: [] };
  } catch (error) {
    return {
      records: [],
      issues: [{
        severity: "error",
        code: "invalid_ledger_json",
        target: path,
        message: (error as Error).message,
      }],
    };
  }
}

function dissentTransitionAllowed(
  previous: CouncilDissentRecord["status"],
  current: CouncilDissentRecord["status"],
): boolean {
  const allowed: Record<CouncilDissentRecord["status"], ReadonlySet<CouncilDissentRecord["status"]>> = {
    open: new Set(["acknowledged", "resolved", "superseded"]),
    acknowledged: new Set(["resolved", "superseded"]),
    resolved: new Set(["superseded"]),
    superseded: new Set(),
  };
  return allowed[previous].has(current);
}

function vetoTransitionAllowed(
  previous: CouncilVetoRecord["status"],
  current: CouncilVetoRecord["status"],
): boolean {
  const allowed: Record<CouncilVetoRecord["status"], ReadonlySet<CouncilVetoRecord["status"]>> = {
    binding: new Set(["cleared", "superseded"]),
    cleared: new Set(["superseded"]),
    superseded: new Set(),
  };
  return allowed[previous].has(current);
}

export function validateCouncilLedgerLifecycle(
  dissent: CouncilDissentRecord[],
  veto: CouncilVetoRecord[],
): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  const dissentById = new Map(dissent.map((record) => [record.dissentId, record]));
  for (const record of dissent) {
    if (record.status === "resolved" && record.resolvedAt) {
      if (compareExplicitIso8601Instants(
        record.resolvedAt,
        record.issuedAt,
        "dissent resolvedAt",
        "dissent issuedAt",
      ) < 0) {
        issues.push({
          severity: "error",
          code: "dissent_resolved_before_revision",
          target: record.dissentId,
          message: "resolvedAtは解決revisionのissuedAt以後である必要があります",
        });
      }
    }
    if (!record.supersedesDissentId) continue;
    const previous = dissentById.get(record.supersedesDissentId);
    if (!previous) continue;
    if (!dissentTransitionAllowed(previous.status, record.status)) {
      issues.push({
        severity: "error",
        code: "invalid_dissent_status_transition",
        target: record.dissentId,
        message: `${previous.status} -> ${record.status} は許可されません`,
      });
    }
    if (compareExplicitIso8601Instants(
      record.informationCutoff,
      previous.informationCutoff,
      "dissent informationCutoff",
      "previous dissent informationCutoff",
    ) < 0) {
      issues.push({
        severity: "error",
        code: "dissent_cutoff_regression",
        target: record.dissentId,
        message: "dissent revisionのinformationCutoffを過去へ戻せません",
      });
    }
  }

  const vetoById = new Map(veto.map((record) => [record.vetoId, record]));
  for (const record of veto) {
    if (record.status === "cleared" && record.clearedAt) {
      if (compareExplicitIso8601Instants(
        record.clearedAt,
        record.issuedAt,
        "veto clearedAt",
        "veto issuedAt",
      ) < 0) {
        issues.push({
          severity: "error",
          code: "veto_cleared_before_revision",
          target: record.vetoId,
          message: "clearedAtは解除revisionのissuedAt以後である必要があります",
        });
      }
    }
    if (!record.supersedesVetoId) continue;
    const previous = vetoById.get(record.supersedesVetoId);
    if (!previous) continue;
    if (!vetoTransitionAllowed(previous.status, record.status)) {
      issues.push({
        severity: "error",
        code: "invalid_veto_status_transition",
        target: record.vetoId,
        message: `${previous.status} -> ${record.status} は許可されません`,
      });
    }
    if (compareExplicitIso8601Instants(
      record.informationCutoff,
      previous.informationCutoff,
      "veto informationCutoff",
      "previous veto informationCutoff",
    ) < 0) {
      issues.push({
        severity: "error",
        code: "veto_cutoff_regression",
        target: record.vetoId,
        message: "veto revisionのinformationCutoffを過去へ戻せません",
      });
    }
  }
  return sortIssues(issues);
}

export function validateRepositoryCouncilLedgersGoverned(): {
  catalogIssues: CouncilIssue[];
  dissentIssues: CouncilIssue[];
  vetoIssues: CouncilIssue[];
  lifecycleIssues: CouncilIssue[];
  dissentCount: number;
  vetoCount: number;
  bindingVetoCount: number;
} {
  const council = validateRepositoryStockProCouncilV2();
  const catalogIssues = [...council.catalogIssues];
  if (!council.catalog) {
    return {
      catalogIssues: sortIssues(catalogIssues),
      dissentIssues: [],
      vetoIssues: [],
      lifecycleIssues: [],
      dissentCount: 0,
      vetoCount: 0,
      bindingVetoCount: 0,
    };
  }

  const catalog = loadCouncilYaml(
    STOCK_PRO_COUNCIL_V2_PATHS.catalog,
  ) as StockProCouncilV2Catalog;
  const dissentSchema = loadCouncilSchema(COUNCIL_LEDGER_PATHS.dissentSchema);
  const vetoSchema = loadCouncilSchema(COUNCIL_LEDGER_PATHS.vetoSchema);
  const dissentRead = readStrictLedger<CouncilDissentRecord>(COUNCIL_LEDGER_PATHS.dissent);
  const vetoRead = readStrictLedger<CouncilVetoRecord>(COUNCIL_LEDGER_PATHS.veto);
  const dissentIssues = [
    ...dissentRead.issues,
    ...validateDissentLedger(dissentRead.records, dissentSchema, catalog),
  ];
  const vetoIssues = [
    ...vetoRead.issues,
    ...validateVetoLedger(vetoRead.records, vetoSchema, catalog),
  ];
  const lifecycleIssues = validateCouncilLedgerLifecycle(dissentRead.records, vetoRead.records);

  const supersededVetoIds = new Set(
    vetoRead.records.flatMap((record) => record.supersedesVetoId ? [record.supersedesVetoId] : []),
  );
  const bindingVetoCount = vetoRead.records.filter(
    (record) => record.status === "binding" && !supersededVetoIds.has(record.vetoId),
  ).length;

  return {
    catalogIssues: sortIssues(catalogIssues),
    dissentIssues: sortIssues(dissentIssues),
    vetoIssues: sortIssues(vetoIssues),
    lifecycleIssues,
    dissentCount: dissentRead.records.length,
    vetoCount: vetoRead.records.length,
    bindingVetoCount,
  };
}
