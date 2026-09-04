import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { collectTdnetSourceOnce } from "../src/market-events/tdnet-source-collector.js";

const migration = readFileSync("migrations/0001_market_event_foundation.sql", "utf8");
const db = new DatabaseSync(":memory:");

const disclosures = [
  {
    code: "8136",
    sourceCode: "81360",
    companyName: "サンリオ",
    title: "第三者委員会の設置に関するお知らせ",
    publishedAt: "2026-09-04T15:00:00+09:00",
    url: "https://www.release.tdnet.info/inbs/140120260904000001.pdf",
  },
  {
    code: "4661",
    sourceCode: "46610",
    companyName: "オリエンタルランド",
    title: "自己株式取得状況に関するお知らせ",
    publishedAt: "2026-09-04T15:10:00+09:00",
    url: "https://www.release.tdnet.info/inbs/140120260904000002.pdf",
  },
  {
    code: "4680",
    sourceCode: "46800",
    companyName: "ラウンドワン",
    title: "公開買付けへの応募に関するお知らせ",
    publishedAt: "2026-09-04T15:20:00+09:00",
    url: "https://www.release.tdnet.info/inbs/140120260904000003.pdf",
  },
];

try {
  db.exec(migration);

  const first = await collectTdnetSourceOnce(db, {
    now: () => "2026-09-04T07:00:00Z",
    fetchSnapshot: async () => ({ disclosures, explicitEmpty: false }),
  });
  assert.equal(first.status, "changed");
  assert.equal(first.disclosures.length, 3);
  assert.equal(first.candidates.length, 2, "only event-relevant TDnet rows become review candidates");
  assert.deepEqual(
    new Set(first.candidates.map(candidate => candidate.issuerCode)),
    new Set(["8136", "4680"]),
  );

  const committee = first.candidates.find(candidate => candidate.issuerCode === "8136");
  assert(committee);
  assert.equal(committee.eventTypeHint, "INVESTIGATION_UPDATE");
  const tob = first.candidates.find(candidate => candidate.issuerCode === "4680");
  assert(tob);
  assert.equal(tob.eventTypeHint, null, "TOB title wording alone must remain untyped for deadline registration");

  for (const candidate of first.candidates) {
    assert.equal(candidate.registrationReady, false);
    assert(candidate.blockers.includes("future_event_time_not_explicit"));
    assert(candidate.blockers.includes("stable_occurrence_key_not_established"));
    assert(candidate.blockers.includes("primary_document_review_required"));
    assert.equal("eventId" in candidate, false);
    assert.equal("occurrenceKey" in candidate, false);
    assert.equal("time" in candidate, false);
  }

  const repeated = await collectTdnetSourceOnce(db, {
    now: () => "2026-09-04T07:05:00Z",
    fetchSnapshot: async () => ({
      disclosures: [disclosures[2]!, disclosures[0]!, disclosures[1]!, disclosures[0]!],
      explicitEmpty: false,
    }),
  });
  assert.equal(repeated.status, "unchanged");
  assert.equal(repeated.contentHash, first.contentHash);
  assert.deepEqual(repeated.candidates, first.candidates, "candidate projection must be stable under source order and duplicate rows");

  const empty = await collectTdnetSourceOnce(db, {
    now: () => "2026-09-04T07:10:00Z",
    fetchSnapshot: async () => ({ disclosures: [], explicitEmpty: true }),
  });
  assert.equal(empty.status, "changed");
  assert.equal(empty.explicitEmpty, true);
  assert.deepEqual(empty.candidates, []);

  const failed = await collectTdnetSourceOnce(db, {
    now: () => "2026-09-04T07:15:00Z",
    fetchSnapshot: async () => {
      throw new Error("source unavailable");
    },
  });
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.candidates, []);

  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM market_events").get() as { count: number }).count,
    0,
    "candidate collection must never register Market Events",
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM event_revisions").get() as { count: number }).count,
    0,
    "candidate collection must never create revisions",
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM delivery_outbox").get() as { count: number }).count,
    0,
    "candidate collection must never enqueue delivery",
  );

  console.log("tdnet-candidate-collection: ok");
} finally {
  db.close();
}
