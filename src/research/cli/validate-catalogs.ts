import {
  formatCatalogIssues,
  loadActiveEdgeIds,
  loadJsonSchema,
  loadYaml,
  validateDataSourceCatalog,
  validateEdgeFamilyCatalog,
  validateRepositoryCatalogs,
  CATALOG_PATHS,
  type DataSourceCatalog,
  type EdgeFamilyCatalog,
} from "../catalog-validation.js";

const mode = process.argv[2] ?? "all";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function report(title: string, issues: ReturnType<typeof validateDataSourceCatalog>): void {
  console.log(`\n${title}: ${issues.length === 0 ? "OK" : `${issues.length} issue(s)`}`);
  if (issues.length > 0) console.log(formatCatalogIssues(issues));
}

function main(): void {
  if (mode === "data-sources") {
    const value = loadYaml(CATALOG_PATHS.dataSources);
    const issues = validateDataSourceCatalog(
      value,
      loadJsonSchema(CATALOG_PATHS.dataSourceSchema),
    );
    report(
      `Data Source Catalog (${(value as DataSourceCatalog).sources?.length ?? 0} sources)`,
      issues,
    );
    if (issues.some((issue) => issue.severity === "error")) {
      fail("DATA_SOURCE_REGISTRY_CONTRACT_RED");
    }
    console.log("\n✓ DATA_SOURCE_REGISTRY_CONTRACT_GREEN");
    return;
  }

  if (mode === "edge-families") {
    const value = loadYaml(CATALOG_PATHS.edgeFamilies);
    const issues = validateEdgeFamilyCatalog(
      value,
      loadJsonSchema(CATALOG_PATHS.edgeFamilySchema),
      loadActiveEdgeIds(),
    );
    report(
      `Technology Edge Family Catalog (${(value as EdgeFamilyCatalog).families?.length ?? 0} families)`,
      issues,
    );
    if (issues.some((issue) => issue.severity === "error")) {
      fail("TECH_EDGE_CANDIDATE_CATALOG_RED");
    }
    console.log("\n✓ TECH_EDGE_CANDIDATE_CATALOG_GREEN");
    return;
  }

  if (mode !== "all") {
    fail(`unknown mode: ${mode} (allowed: all, data-sources, edge-families)`);
  }

  const result = validateRepositoryCatalogs();
  report(`Data Source Catalog (${result.sourceCount} sources)`, result.dataSourceIssues);
  report(`Technology Edge Family Catalog (${result.familyCount} families)`, result.edgeFamilyIssues);
  console.log(`\nActive Research OS Edge: ${result.activeEdgeCount}`);
  console.log("Catalog entries are not counted as active Edges.");

  const errors = [...result.dataSourceIssues, ...result.edgeFamilyIssues]
    .filter((issue) => issue.severity === "error");
  if (errors.length > 0) fail(`RESEARCH_CATALOG_CONTRACT_RED (${errors.length} errors)`);

  console.log("\n✓ DATA_SOURCE_REGISTRY_CONTRACT_GREEN");
  console.log("✓ TECH_EDGE_CANDIDATE_CATALOG_GREEN");
}

main();
