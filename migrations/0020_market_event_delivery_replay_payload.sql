-- Fail closed when a stable delivery_id is replayed with different immutable registration payload.
-- Mutable outbox processing fields (state/attempt/error/lease/updated_at) are intentionally excluded
-- so a later exact registration replay does not conflict with legitimate delivery processing.
CREATE TRIGGER IF NOT EXISTS trg_delivery_replay_payload
BEFORE INSERT ON delivery_outbox
WHEN EXISTS (
  SELECT 1
  FROM delivery_outbox existing
  WHERE existing.delivery_id = NEW.delivery_id
    AND NOT (
      existing.delivery_key IS NEW.delivery_key
      AND existing.event_id IS NEW.event_id
      AND existing.revision_id IS NEW.revision_id
      AND existing.schema_version IS NEW.schema_version
      AND existing.channel IS NEW.channel
      AND existing.payload_json IS NEW.payload_json
      AND existing.scheduled_at IS NEW.scheduled_at
      AND existing.created_at IS NEW.created_at
    )
)
BEGIN
  SELECT RAISE(ABORT, 'delivery replay payload mismatch');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0020_market_event_delivery_replay_payload', datetime('now'));
