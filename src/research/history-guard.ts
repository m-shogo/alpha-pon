// Research OS — Append Only / 不変性ガード（純ロジック）。
// git から取り出した「前の内容」と「今の内容」を比較するだけで、git そのものは触らない。
// git 呼び出しは src/research/cli/check-history.ts 側。

import { stableStringify } from "./schema.js";

export interface GuardViolation {
  file: string;
  code: "not_append_only" | "immutable_file_modified" | "immutable_field_changed" | "record_removed";
  message: string;
}

/**
 * JSONL の Append Only 判定。
 * 新しい内容は、古い内容を完全な接頭辞として含んでいなければならない。
 * （既存行の書き換え・削除・並べ替えをすべて弾ける）
 */
export function isAppendOnly(oldContent: string, newContent: string): { ok: boolean; reason?: string } {
  if (oldContent.length === 0) return { ok: true };
  if (!newContent.startsWith(oldContent)) {
    const oldLines = splitLines(oldContent);
    const newLines = splitLines(newContent);
    if (newLines.length < oldLines.length) {
      return { ok: false, reason: `行が削除されています（${oldLines.length} → ${newLines.length} 行）` };
    }
    const changedIndex = oldLines.findIndex((line, index) => newLines[index] !== line);
    return {
      ok: false,
      reason:
        changedIndex >= 0
          ? `${changedIndex + 1} 行目が変更されています（Append Only 違反）`
          : "既存部分が変更されています（Append Only 違反）",
    };
  }
  return { ok: true };
}

function splitLines(content: string): string[] {
  return content.split("\n").filter((line, index, all) => !(line === "" && index === all.length - 1));
}

/** Edge のうち、作成後に変えてはいけないフィールド。 */
export const EDGE_IMMUTABLE_FIELDS = ["id", "hypothesis", "createdAt"] as const;
export const RESEARCH_ASSET_IMMUTABLE_FIELDS = ["schemaVersion", "id", "assetType"] as const;

const CATALOG_IMMUTABLE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "research/knowledge_catalog/research_items/": ["schemaVersion", "ontologyVersion", "id", "createdAt", "origin"],
  "research/knowledge_catalog/research_questions/": ["schemaVersion", "ontologyVersion", "id", "createdAt"],
  "research/knowledge_catalog/mechanisms/": ["schemaVersion", "ontologyVersion", "id", "createdAt"],
  "research/knowledge_catalog/research_families/": ["schemaVersion", "ontologyVersion", "id", "createdAt"],
  "research/knowledge_catalog/research_components/": ["schemaVersion", "ontologyVersion", "id", "kind", "createdAt"],
  "research/knowledge_catalog/cases/": ["schemaVersion", "ontologyVersion", "id", "createdAt"],
  "research/knowledge_catalog/studies/": ["schemaVersion", "ontologyVersion", "id", "mode", "createdAt"],
  "research/knowledge_catalog/opportunities/": ["schemaVersion", "ontologyVersion", "id", "detectedAt"],
};

const CATALOG_IMMUTABLE_FILE_PREFIXES = [
  "research/knowledge_catalog/observations/",
  "research/knowledge_catalog/sample_manifests/",
  "research/knowledge_catalog/study_results/",
  "research/knowledge_catalog/relations/",
  "research/knowledge_catalog/lineages/",
] as const;

export function changedImmutableFields(
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
  fields: readonly string[],
): string[] {
  return fields.filter((field) => stableStringify(oldValue[field]) !== stableStringify(newValue[field]));
}

/** Historical facts are immutable. A correction is a new record, never a rewrite. */
export function isUnchanged(oldContent: string, newContent: string): boolean {
  return oldContent.trimEnd() === newContent.trimEnd();
}

export interface FileChange {
  path: string;
  /** git 上の変更種別 */
  changeType: "added" | "modified" | "deleted" | "renamed";
  oldContent: string | null;
  newContent: string | null;
}

export type ImmutabilityRule = "append_only" | "immutable_file" | "immutable_fields" | "mutable";

export function immutableFieldsForPath(path: string): readonly string[] {
  if (path.startsWith("research/edge_registry/edges/")) return EDGE_IMMUTABLE_FIELDS;
  if (path.startsWith("research/asset_registry/assets/") && path.endsWith(".yml")) {
    return RESEARCH_ASSET_IMMUTABLE_FIELDS;
  }
  for (const [prefix, fields] of Object.entries(CATALOG_IMMUTABLE_FIELDS)) {
    if (path.startsWith(prefix) && path.endsWith(".yml")) return fields;
  }
  return [];
}

/** パスからルールを決める。ここが Research OS の「何を守るか」の一覧表。 */
export function ruleForPath(path: string): ImmutabilityRule {
  if (path.startsWith("research/research_log/") && path.endsWith(".jsonl")) return "append_only";
  if (path === "research/counterfactual/counterfactuals.jsonl") return "append_only";
  if (path === "research/confounder/confounders.jsonl") return "append_only";
  if (path === "research/holdout/access_log.jsonl") return "append_only";
  if (path === "research/edge_registry/provenance.jsonl") return "append_only";
  if (path === "research/asset_registry/provenance.jsonl") return "append_only";
  if (path.startsWith("research/historical/analogs/")) return "immutable_file";
  if (path.startsWith("research/checkpoint/history/")) return "immutable_file";
  if (CATALOG_IMMUTABLE_FILE_PREFIXES.some((prefix) => path.startsWith(prefix) && path.endsWith(".yml"))) {
    return "immutable_file";
  }
  if (path.startsWith("research/edge_registry/edges/") && path.endsWith(".yml")) return "immutable_fields";
  if (immutableFieldsForPath(path).length > 0) return "immutable_fields";
  return "mutable";
}

/**
 * 変更一覧を検査して違反を返す。
 * `parseYamlRecord` は YAML パーサの注入（純ロジックに js-yaml を持ち込まないため）。
 */
export function checkChanges(
  changes: FileChange[],
  parseYamlRecord: (content: string) => Record<string, unknown>,
): GuardViolation[] {
  const violations: GuardViolation[] = [];

  for (const change of changes) {
    const rule = ruleForPath(change.path);
    if (rule === "mutable") continue;

    if (change.changeType === "deleted") {
      violations.push({
        file: change.path,
        code: "record_removed",
        message: "Research OS の記録は削除できません（監査可能性のため）",
      });
      continue;
    }
    if (change.changeType === "added" || change.oldContent === null || change.newContent === null) continue;

    if (rule === "append_only") {
      const result = isAppendOnly(change.oldContent, change.newContent);
      if (!result.ok) {
        violations.push({ file: change.path, code: "not_append_only", message: result.reason ?? "Append Only 違反" });
      }
      continue;
    }

    if (rule === "immutable_file") {
      if (!isUnchanged(change.oldContent, change.newContent)) {
        violations.push({
          file: change.path,
          code: "immutable_file_modified",
          message: "作成後に変更できない記録です。訂正は既存記録を書き換えず、新しい記録・Relation・Lineageで表現してください",
        });
      }
      continue;
    }

    if (rule === "immutable_fields") {
      const fields = immutableFieldsForPath(change.path);
      const changed = changedImmutableFields(
        parseYamlRecord(change.oldContent),
        parseYamlRecord(change.newContent),
        fields,
      );
      if (changed.length > 0) {
        const edgeHint = change.path.startsWith("research/edge_registry/edges/")
          ? "（仮説を変えたい場合は新しい Edge を作ってください）"
          : change.path.startsWith("research/asset_registry/assets/")
            ? "（Asset identity/typeの変更は新しいAsset IDを作ってください。path変更は同一identityのrenameとして許可されます）"
            : "（identity変更は新しいResearch identity + Lineageで表現してください）";
        violations.push({
          file: change.path,
          code: "immutable_field_changed",
          message: `変更できないフィールドです: ${changed.join(", ")} ${edgeHint}`,
        });
      }
    }
  }

  return violations;
}
