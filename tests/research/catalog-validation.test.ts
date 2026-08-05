import assert from "node:assert/strict";
import {
  catalogFingerprint,
  CATALOG_PATHS,
  loadActiveEdgeIds,
  loadJsonSchema,
  loadYaml,
  validateDataSourceCatalog,
  validateEdgeFamilyCatalog,
  type DataSourceCatalog,
  type EdgeFamilyCatalog,
} from "../../src/research/catalog-validation.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

const sourceSchema = loadJsonSchema(CATALOG_PATHS.dataSourceSchema);
const familySchema = loadJsonSchema(CATALOG_PATHS.edgeFamilySchema);
const sourceCatalog = loadYaml(CATALOG_PATHS.dataSources) as DataSourceCatalog;
const familyCatalog = loadYaml(CATALOG_PATHS.edgeFamilies) as EdgeFamilyCatalog;
const activeEdgeIds = loadActiveEdgeIds();

// 実catalogがschema + semantic gateを通る。
{
  const issues = validateDataSourceCatalog(sourceCatalog, sourceSchema);
  assert.deepEqual(issues, [], `real data source catalog: ${JSON.stringify(issues, null, 2)}`);
  console.log(`research/catalog: data source ${sourceCatalog.sources.length}件 OK`);
}

{
  const issues = validateEdgeFamilyCatalog(familyCatalog, familySchema, activeEdgeIds);
  assert.deepEqual(issues, [], `real edge family catalog: ${JSON.stringify(issues, null, 2)}`);
  console.log(`research/catalog: edge family ${familyCatalog.families.length}件 OK`);
}

// 内容が異なってもsource idが同じなら拒否。
{
  const value = clone(sourceCatalog);
  const duplicate = clone(value.sources[0]);
  duplicate.name = `${duplicate.name} duplicate fixture`;
  value.sources.push(duplicate);
  const issues = validateDataSourceCatalog(value, sourceSchema);
  assert.ok(issues.some((issue) => issue.code === "duplicate_source_id"));
}

// core/pilotはblocker、use case、確定済みrightsが必要。
{
  const value = clone(sourceCatalog);
  value.sources[0].blockers = [];
  value.sources[0].edgeUseCases = [];
  value.sources[0].rights.rawStorage = "unknown";
  const codes = validateDataSourceCatalog(value, sourceSchema).map((issue) => issue.code);
  assert.ok(codes.includes("missing_adoption_blocker"));
  assert.ok(codes.includes("missing_edge_use_case"));
  assert.ok(codes.includes("unknown_rights_for_adopted_source"));
}

// discovery_onlyを証拠やmarket roleへ漏らさない。
{
  const value = clone(sourceCatalog);
  const source = value.sources[0];
  source.id = "synthetic-social-discovery";
  source.sourceClass = "discovery_only";
  source.adoption = "catalog_only";
  source.roadmapPhase = "none";
  source.roles = ["discovery", "evidence"];
  source.discoveryPolicy = {
    mayDiscoverFromSocial: true,
    mayUseAsEvidence: true,
    officialAccountRule: "名前と認証マークだけで公式と判断する",
  };
  value.sources = [source];
  const codes = validateDataSourceCatalog(value, sourceSchema).map((issue) => issue.code);
  assert.ok(codes.includes("discovery_source_role_leak"));
  assert.ok(codes.includes("discovery_source_as_evidence"));
}

// URL/authの契約不整合を拒否。
{
  const value = clone(sourceCatalog);
  value.sources[0].officialUrl = "not-a-url";
  value.sources[0].auth.mode = "none";
  value.sources[0].auth.secretRequired = true;
  const codes = validateDataSourceCatalog(value, sourceSchema).map((issue) => issue.code);
  assert.ok(codes.includes("invalid_official_url"));
  assert.ok(codes.includes("auth_secret_mismatch"));
}

// 内容が異なってもfamily id/titleが同じなら拒否。
{
  const value = clone(familyCatalog);
  const duplicate = clone(value.families[0]);
  duplicate.thesis = `${duplicate.thesis} duplicate fixture`;
  value.families.push(duplicate);
  const codes = validateEdgeFamilyCatalog(value, familySchema, activeEdgeIds)
    .map((issue) => issue.code);
  assert.ok(codes.includes("duplicate_family_id"));
  assert.ok(codes.includes("duplicate_family_title"));
}

// candidate catalogからactive化できない。
{
  const value = clone(familyCatalog);
  value.families[0].activationState = "active-research";
  const codes = validateEdgeFamilyCatalog(value, familySchema, activeEdgeIds)
    .map((issue) => issue.code);
  assert.ok(codes.includes("catalog_activation_forbidden"));
}

// active Edge RegistryとのID重複を拒否し、catalog件数をactive数へ混入させない。
{
  const value = clone(familyCatalog);
  const syntheticActive = new Set(activeEdgeIds);
  syntheticActive.add(value.families[0].id);
  const issues = validateEdgeFamilyCatalog(value, familySchema, syntheticActive);
  assert.ok(issues.some((issue) => issue.code === "catalog_active_edge_overlap"));

  const realFamilyIds = new Set(familyCatalog.families.map((family) => family.id));
  for (const activeId of activeEdgeIds) {
    assert.equal(realFamilyIds.has(activeId), false, `active Edge ${activeId} がcandidate catalogへ混入`);
  }
}

// catalogではfalsificationだけ定義済み、他gateは証拠付きactivation PRまでfalse。
{
  const value = clone(familyCatalog);
  value.families[0].activationGate = {
    ...value.families[0].activationGate,
    objectiveTriggerDefined: true,
    falsificationDefined: false,
  };
  const codes = validateEdgeFamilyCatalog(value, familySchema, activeEdgeIds)
    .map((issue) => issue.code);
  assert.ok(codes.includes("premature_activation_claim"));
  assert.ok(codes.includes("falsification_gate_not_met"));
}

// 同じ入力は同じissue順・fingerprintになる。
{
  const invalid = clone(sourceCatalog);
  invalid.sources[0].blockers = [];
  const first = validateDataSourceCatalog(invalid, sourceSchema);
  const second = validateDataSourceCatalog(clone(invalid), sourceSchema);
  assert.equal(catalogFingerprint(first), catalogFingerprint(second));
}

console.log("research/catalog-validation: 全テスト成功");
