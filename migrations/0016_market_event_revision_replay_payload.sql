CREATE TRIGGER IF NOT EXISTS trg_event_revision_replay_payload
BEFORE INSERT ON event_revisions
WHEN EXISTS (
  SELECT 1
  FROM event_revisions existing
  WHERE existing.revision_id = NEW.revision_id
    AND (
      existing.event_id IS NOT NEW.event_id
      OR existing.schema_version IS NOT NEW.schema_version
      OR existing.revision_number IS NOT NEW.revision_number
      OR existing.observed_at IS NOT NEW.observed_at
      OR existing.published_at IS NOT NEW.published_at
      OR existing.effective_at IS NOT NEW.effective_at
      OR existing.first_executable_at IS NOT NEW.first_executable_at
      OR existing.change_type IS NOT NEW.change_type
      OR existing.facts_json IS NOT NEW.facts_json
      OR existing.source_ids_json IS NOT NEW.source_ids_json
      OR existing.previous_revision_id IS NOT NEW.previous_revision_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'event revision replay payload mismatch');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0016_market_event_revision_replay_payload', datetime('now'));
