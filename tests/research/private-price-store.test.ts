import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DailyQuote } from "../../src/fetcher/jquants.js";
import { appendPrivatePriceRecords } from "../../src/research/private-price-store.js";
import { mapJQuantsFreeQuote } from "../../src/research/providers/jquants-free.js";
import { withPriceRecordHash } from "../../src/research/price-store.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/price-record.schema.json", "utf-8"),
) as JsonSchema;

const quote: DailyQuote = {
  Code: "81360",
  Date: "20260514",
  Open: 7200,
  High: 7350,
  Low: 7150,
  Close: 7300,
  Volume: 1_234_500,
  AdjustmentFactor: 1,
  AdjustmentClose: 7300,
  AdjustmentVolume: 1_234_500,
};

const record = withPriceRecordHash(mapJQuantsFreeQuote({
  requestedCode: "8136",
  quote,
  retrievedAt: "2026-08-07T02:30:00.000Z",
  firstExecutableAt: "2026-08-07T09:00:00+09:00",
  ingestionRunId: "private-price-store-fixture",
}));

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

{
  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-private-price-"));
  const parent = join(sandbox, "prices");
  const root = join(parent, "jquants-free");
  const path = join(root, "8136.jsonl");
  mkdirSync(root, { recursive: true, mode: 0o777 });
  chmodSync(root, 0o777);
  writeFileSync(path, "", { mode: 0o666 });
  chmodSync(path, 0o666);

  appendPrivatePriceRecords({
    root,
    path,
    records: [record],
    schema,
    now: new Date("2026-08-07T03:00:00.000Z"),
  });

  assert.equal(mode(root), 0o700);
  assert.equal(mode(path), 0o600);
  assert.match(readFileSync(path, "utf-8"), /"contentHash"/);
  console.log("private-price-store: permissive existing root/file are tightened to 0700/0600 OK");
}

{
  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-private-price-symlink-file-"));
  const parent = join(sandbox, "prices");
  const root = join(parent, "jquants-free");
  const target = join(sandbox, "outside.jsonl");
  const path = join(root, "8136.jsonl");
  mkdirSync(root, { recursive: true });
  writeFileSync(target, "outside\n");
  symlinkSync(target, path);

  assert.throws(() => appendPrivatePriceRecords({
    root,
    path,
    records: [record],
    schema,
    now: new Date("2026-08-07T03:00:00.000Z"),
  }), /private price file must be a regular non-symlink file/);
  assert.equal(readFileSync(target, "utf-8"), "outside\n");
  console.log("private-price-store: symlink price file is rejected before append OK");
}

{
  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-private-price-symlink-root-"));
  const parent = join(sandbox, "prices");
  const outside = join(sandbox, "outside-root");
  const root = join(parent, "jquants-free");
  const path = join(root, "8136.jsonl");
  mkdirSync(parent, { recursive: true });
  mkdirSync(outside);
  symlinkSync(outside, root);

  assert.throws(() => appendPrivatePriceRecords({
    root,
    path,
    records: [record],
    schema,
    now: new Date("2026-08-07T03:00:00.000Z"),
  }), /private price root must be a regular non-symlink directory/);
  assert.deepEqual(readdirSync(outside), []);
  console.log("private-price-store: symlink provider root is rejected before writing outside root OK");
}

{
  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-private-price-nested-"));
  const parent = join(sandbox, "prices");
  const root = join(parent, "jquants-free");
  const path = join(root, "nested", "8136.jsonl");
  mkdirSync(parent, { recursive: true });

  assert.throws(() => appendPrivatePriceRecords({
    root,
    path,
    records: [record],
    schema,
    now: new Date("2026-08-07T03:00:00.000Z"),
  }), /direct child/);
  console.log("private-price-store: nested path is rejected by direct-child boundary OK");
}

console.log("private-price-store.test.ts passed");
