-- Fail closed when a stable decision_snapshot_id is replayed with a different immutable payload.
-- Exact duplicate inserts remain idempotent under INSERT OR IGNORE.
CREATE TRIGGER IF NOT EXISTS trg_decision_snapshot_replay_payload
BEFORE INSERT ON decision_snapshots
WHEN EXISTS (
  SELECT 1
  FROM decision_snapshots existing
  WHERE existing.decision_snapshot_id = NEW.decision_snapshot_id
    AND NOT (
      existing.event_id IS NEW.event_id
      AND existing.revision_id IS NEW.revision_id
      AND existing.schema_version IS NEW.schema_version
      AND existing.decision_state IS NEW.decision_state
      AND existing.confidence_state IS NEW.confidence_state
      AND existing.reasons_json IS NEW.reasons_json
      AND existing.invalidation_conditions_json IS NEW.invalidation_conditions_json
      AND existing.created_at IS NEW.created_at
    )
)
BEGIN
  SELECT RAISE(ABORT, 'decision snapshot replay payload mismatch');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0019_market_event_decision_replay_payload', datetime('now'));
