import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readListingEventAlertConfig } from "../src/listing-event-alert-config.js";
import { readListingEventSyncConfig } from "../src/listing-event-sync-config.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-listing-event-sync-config-"));
const path = join(dir, "listing-event-watch.yml");

try {
  writeFileSync(path, JSON.stringify({
    requiredMilestones: {
      listing_day: { notificationLevel: "priority" },
      bad_level: { notificationLevel: "urgent" },
      bad_row: null,
    },
    manualSeedEvents: [
      { id: "valid-1", name: "Valid", eventType: "listing_day", eventDate: "2024-02-29", notes: [] },
      null,
      {},
      { id: "bad-notes", name: "Bad", eventType: "listing_day", notes: {} },
      { id: "bad-date", name: "Bad Date", eventType: "listing_day", eventDate: "2026-02-31" },
      { id: "valid-2", name: "Valid 2", eventType: "pre_ipo", evidenceToBackfill: [] },
    ],
  }));

  const alertConfig = readListingEventAlertConfig(path);
  assert.deepEqual(alertConfig.config, {
    requiredMilestones: { listing_day: { notificationLevel: "priority" } },
  });
  assert.deepEqual(alertConfig.warnings, [`${path}: invalid_required_milestones=2`]);

  const result = readListingEventSyncConfig(path);
  assert.deepEqual(result.rows.map(row => row.id), ["valid-1", "valid-2"]);
  assert.deepEqual(result.warnings, [`${path}: invalid_manual_seed_rows=2,3,4,5`]);

  writeFileSync(path, JSON.stringify({ manualSeedEvents: {} }));
  assert.deepEqual(readListingEventSyncConfig(path), {
    rows: [],
    warnings: [`${path}: invalid_manual_seed_events_root`],
  });

  writeFileSync(path, JSON.stringify({ requiredMilestones: [] }));
  assert.deepEqual(readListingEventAlertConfig(path), {
    config: {},
    warnings: [`${path}: invalid_required_milestones_root`],
  });

  writeFileSync(path, "[");
  assert.deepEqual(readListingEventSyncConfig(path), {
    rows: [],
    warnings: [`${path}: parse_error`],
  });
  assert.deepEqual(readListingEventAlertConfig(path), {
    config: {},
    warnings: [`${path}: parse_error`],
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("listing-event-sync-config: OK");
