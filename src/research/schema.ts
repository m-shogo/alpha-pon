// Research OS — 依存ゼロの JSON Schema サブセット validator。
//
// なぜ ajv を使わないか:
//   - このリポジトリの依存は js-yaml のみ。研究基盤の検証が外部依存の
//     バージョン差で揺れると「再現可能」が壊れる。
//   - 必要なキーワードは限られており、決定論的な実装で足りる。
//
// サポートするキーワード:
//   type / const / enum / required / properties / additionalProperties /
//   items / minItems / maxItems / uniqueItems /
//   minimum / maximum / exclusiveMinimum / exclusiveMaximum /
//   minLength / maxLength / pattern / format(date, date-time) /
//   $ref(同一ドキュメント内の #/$defs/... のみ)
//
// 未対応キーワードが現れたら黙って無視せず例外にする（仕様と実装のズレを防ぐ）。

export interface SchemaError {
  path: string;
  message: string;
}

export interface JsonSchema {
  [keyword: string]: unknown;
}

const SUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "title",
  "description",
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // 2026-02-31 のような存在しない日付を弾く
  return parsed.toISOString().slice(0, 10) === value;
}

export function isValidDateTime(value: string): boolean {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return false;
  if (!isValidDate(match[1]!)) return false;

  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  if (
    hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
    || second < 0
    || second > 59
  ) return false;

  if (match[5] !== "Z") {
    if (match[5] === "-00:00") return false;
    const offsetHour = Number(match[7]);
    const offsetMinute = Number(match[8]);
    if (
      offsetHour > 14
      || offsetMinute > 59
      || (offsetHour === 14 && offsetMinute !== 0)
    ) return false;
  }

  return true;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function matchesType(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  if (expected === "object") return actual === "object";
  return actual === expected;
}

function assertSupported(schema: JsonSchema, path: string): void {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new Error(
        `未対応の JSON Schema キーワード "${keyword}" が ${path} にあります。src/research/schema.ts を拡張してください。`,
      );
    }
  }
}

function resolveRef(ref: string, root: JsonSchema, path: string): JsonSchema {
  if (!ref.startsWith("#/")) {
    throw new Error(`$ref は同一ドキュメント内のみ対応しています: ${ref} (${path})`);
  }
  let node: unknown = root;
  for (const rawSegment of ref.slice(2).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (typeof node !== "object" || node === null) {
      throw new Error(`$ref を解決できません: ${ref} (${path})`);
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (typeof node !== "object" || node === null) {
    throw new Error(`$ref を解決できません: ${ref} (${path})`);
  }
  return node as JsonSchema;
}

function validateNode(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: SchemaError[],
): void {
  assertSupported(schema, path);

  if (typeof schema.$ref === "string") {
    validateNode(value, resolveRef(schema.$ref, root, path), root, path, errors);
    return;
  }

  if ("const" in schema && !deepEqual(value, schema.const)) {
    errors.push({ path, message: `${JSON.stringify(schema.const)} である必要があります` });
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => deepEqual(candidate, value))) {
    errors.push({
      path,
      message: `許可されていない値です（許可: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}）`,
    });
    return;
  }

  if (typeof schema.type === "string" && !matchesType(value, schema.type)) {
    errors.push({ path, message: `型が ${schema.type} ではありません（実際: ${typeOf(value)}）` });
    return;
  }

  if (typeof value === "string") validateString(value, schema, path, errors);
  if (typeof value === "number") validateNumber(value, schema, path, errors);
  if (Array.isArray(value)) validateArray(value, schema, root, path, errors);
  else if (typeof value === "object" && value !== null) {
    validateObject(value as Record<string, unknown>, schema, root, path, errors);
  }
}

function validateString(value: string, schema: JsonSchema, path: string, errors: SchemaError[]): void {
  if (typeof schema.minLength === "number" && value.length < schema.minLength) {
    errors.push({ path, message: `${schema.minLength} 文字以上である必要があります（実際: ${value.length}）` });
  }
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
    errors.push({ path, message: `${schema.maxLength} 文字以下である必要があります（実際: ${value.length}）` });
  }
  if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
    errors.push({ path, message: `パターン ${schema.pattern} に一致しません` });
  }
  if (schema.format === "date" && !isValidDate(value)) {
    errors.push({ path, message: `YYYY-MM-DD 形式の実在する日付である必要があります` });
  }
  if (schema.format === "date-time" && !isValidDateTime(value)) {
    errors.push({ path, message: `タイムゾーン付き ISO 8601 日時である必要があります（例: 2026-08-04T09:00:00+09:00）` });
  }
}

function validateNumber(value: number, schema: JsonSchema, path: string, errors: SchemaError[]): void {
  if (typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push({ path, message: `${schema.minimum} 以上である必要があります` });
  }
  if (typeof schema.maximum === "number" && value > schema.maximum) {
    errors.push({ path, message: `${schema.maximum} 以下である必要があります` });
  }
  if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
    errors.push({ path, message: `${schema.exclusiveMinimum} より大きい必要があります` });
  }
  if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) {
    errors.push({ path, message: `${schema.exclusiveMaximum} より小さい必要があります` });
  }
}

function validateArray(
  value: unknown[],
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: SchemaError[],
): void {
  if (typeof schema.minItems === "number" && value.length < schema.minItems) {
    errors.push({ path, message: `${schema.minItems} 件以上必要です（実際: ${value.length}）` });
  }
  if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
    errors.push({ path, message: `${schema.maxItems} 件以下である必要があります（実際: ${value.length}）` });
  }
  if (schema.uniqueItems === true) {
    const seen = new Set<string>();
    for (const item of value) {
      const key = stableStringify(item);
      if (seen.has(key)) {
        errors.push({ path, message: `重複した要素があります: ${key}` });
        break;
      }
      seen.add(key);
    }
  }
  if (schema.items && typeof schema.items === "object") {
    value.forEach((item, index) => {
      validateNode(item, schema.items as JsonSchema, root, `${path}[${index}]`, errors);
    });
  }
}

function validateObject(
  value: Record<string, unknown>,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: SchemaError[],
): void {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;

  if (Array.isArray(schema.required)) {
    for (const key of schema.required as string[]) {
      if (!(key in value) || value[key] === undefined) {
        errors.push({ path: path ? `${path}.${key}` : key, message: "必須フィールドがありません" });
      }
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) {
        errors.push({ path: path ? `${path}.${key}` : key, message: "スキーマに定義されていないフィールドです" });
      }
    }
  }

  for (const [key, propSchema] of Object.entries(properties)) {
    if (!(key in value) || value[key] === undefined) continue;
    validateNode(value[key], propSchema, root, path ? `${path}.${key}` : key, errors);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** キー順に依存しない安定シリアライズ。重複検知・比較の基準に使う。 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** スキーマ違反の一覧を返す。空配列なら valid。 */
export function validate(value: unknown, schema: JsonSchema): SchemaError[] {
  const errors: SchemaError[] = [];
  validateNode(value, schema, schema, "", errors);
  return errors;
}

export function formatErrors(errors: SchemaError[]): string {
  return errors.map((e) => `  - ${e.path || "(root)"}: ${e.message}`).join("\n");
}
