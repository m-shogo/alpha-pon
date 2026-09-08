-- Fail closed when a stable source_id is replayed with a different immutable payload.
-- Exact duplicate inserts remain idempotent under INSERT OR IGNORE.
CREATE TRIGGER IF NOT EXISTS trg_event_source_replay_payload
BEFORE INSERT ON event_sources
WHEN EXISTS (
  SELECT 1
  FROM event_sources existing
  WHERE existing.source_id = NEW.source_id
    AND NOT (
      existing.event_id IS NEW.event_id
      AND existing.schema_version IS NEW.schema_version
      AND existing.authority IS NEW.authority
      AND existing.source_type IS NEW.source_type
      AND existing.url IS NEW.url
      AND existing.title IS NEW.title
      AND existing.published_at IS NEW.published_at
      AND existing.retrieved_at IS NEW.retrieved_at
      AND existing.content_hash IS NEW.content_hash
      AND existing.storage_class IS NEW.storage_class
      AND existing.object_key IS NEW.object_key
    )
)
BEGIN
  SELECT RAISE(ABORT, 'event source replay payload mismatch');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0018_market_event_source_replay_payload', datetime('now'));
