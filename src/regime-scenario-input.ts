import { readReadOnlyJsonArrayFile } from "./read-only-json-file.js";

export type RegimeScenarioReflection = {
  date?: string;
  title?: string;
  category?: string;
  tags?: string[];
  riskLevel?: string;
};

export function loadRegimeScenarioReflections(path = "data/world_event_reflections.json"): RegimeScenarioReflection[] {
  const loaded = readReadOnlyJsonArrayFile<RegimeScenarioReflection>(path);
  if (loaded.parseError) {
    throw new Error(`${path}: parse_error`);
  }
  if (loaded.invalidRoot) {
    throw new Error(`${path}: invalid_root (expected array)`);
  }
  return loaded.rows;
}
