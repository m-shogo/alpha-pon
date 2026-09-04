import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getSourceCheckpoint } from "../src/market-events/source-checkpoint-store.js";
import { collectTdnetSourceOnce } from "../src/market-events/tdnet-source-collector.js";

const migration = readFileSync("migrations/0001_market_event_foundation.sql", "utf8");
const db = new DatabaseSync(":memory:");

try {
  db.exec(migration);

  const first = await collectTdnetSourceOnce(db, {
    now: () => "2026-09-04T02:00:00Z",
    fetchSnapshot: async () => ({ disclosures: [], explicitEmpty: true }),
  });
  assert.equal(first.status, "changed");
  assert.equal(first.explicitEmpty, true);
  assert.deepEqual(first.disclosures, []);
  assert.match(first.contentHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(first.error, null);

  const firstCheckpoint = getSourceCheckpoint(db, first.sourceKey);
  assert(firstCheckpoint);
  assert.equal(firstCheckpoint.lastSuccessAt, "2026-09-04T02:00:00Z");
  assert.equal(firstCheckpoint.lastContentHash, first.contentHash);
  assert.equal(firstCheckpoint.consecutiveFailures, 0);
  assert.equal(firstCheckpoint.lastError, null);

  const repeated = await collectTdnetSourceOnce(db, {
    now: () => "2026-09-04T02:05:00Z",
    fetchSnapshot: async () => ({ disclosures: [], explicitEmpty: true }),
  });
  assert.equal(repeated.status, "unchanged");
  assert.equal(repeated.explicitEmpty, true);
  assert.equal(repeated.contentHash, first.contentHash);

  const legacyEmpty = await collectTdnetSourceOnce(db, {
    now: () => "2026-09-04T02:10:00Z",
    fetchDisclosures: async () => [],
  });
  assert.equal(legacyEmpty.status, "failed");
  assert.equal(legacyEmpty.explicitEmpty, false);
  assert.equal(legacyEmpty.error, "TDnet disclosure fetch returned zero rows");
  assert.equal(legacyEmpty.contentHash, first.contentHash);

  const afterLegacyEmpty = getSourceCheckpoint(db, first.sourceKey);
  assert(afterLegacyEmpty);
  assert.equal(afterLegacyEmpty.lastCheckedAt, "2026-09-04T02:10:00Z");
  assert.equal(afterLegacyEmpty.lastSuccessAt, "2026-09-04T02:05:00Z");
  assert.equal(afterLegacyEmpty.lastContentHash, first.contentHash);
  assert.equal(afterLegacyEmpty.consecutiveFailures, 1);
  assert.equal(afterLegacyEmpty.lastError, "TDnet disclosure fetch returned zero rows");

  const inconsistent = await collectTdnetSourceOnce(db, {
    now: () => "2026-09-04T02:15:00Z",
    fetchSnapshot: async () => ({
      explicitEmpty: true,
      disclosures: [{
        code: "8136",
        sourceCode: "81360",
        companyName: "サンリオ",
        title: "第三者委員会の設置に関するお知らせ",
        publishedAt: "2026-09-04T15:00:00+09:00",
        url: "https://www.release.tdnet.info/inbs/140120260904000001.pdf",
      }],
    }),
  });
  assert.equal(inconsistent.status, "failed");
  assert.match(inconsistent.error ?? "", /cannot be explicit-empty/);
  assert.equal(inconsistent.contentHash, first.contentHash);

  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM market_events").get() as { count: number }).count,
    0,
    "TDnet source-state collection must not register Market Events",
  );

  console.log("tdnet-source-collector-current-viewer: ok");
} finally {
  db.close();
}
