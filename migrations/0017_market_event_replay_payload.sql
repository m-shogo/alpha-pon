CREATE TRIGGER IF NOT EXISTS trg_market_event_replay_payload
BEFORE INSERT ON market_events
WHEN EXISTS (
  SELECT 1
  FROM market_events existing
  WHERE existing.event_id = NEW.event_id
    AND existing.updated_at = NEW.updated_at
    AND (
      existing.schema_version IS NOT NEW.schema_version
      OR existing.occurrence_key IS NOT NEW.occurrence_key
      OR existing.issuer_code IS NOT NEW.issuer_code
      OR existing.issuer_name IS NOT NEW.issuer_name
      OR existing.event_type IS NOT NEW.event_type
      OR existing.title IS NOT NEW.title
      OR existing.status IS NOT NEW.status
      OR existing.priority IS NOT NEW.priority
      OR existing.start_at IS NOT NEW.start_at
      OR existing.end_at IS NOT NEW.end_at
      OR existing.all_day IS NOT NEW.all_day
      OR existing.timezone IS NOT NEW.timezone
      OR existing.time_precision IS NOT NEW.time_precision
      OR existing.window_start IS NOT NEW.window_start
      OR existing.window_end IS NOT NEW.window_end
      OR existing.edge_types_json IS NOT NEW.edge_types_json
      OR existing.current_decision_state IS NOT NEW.current_decision_state
      OR existing.why_it_matters IS NOT NEW.why_it_matters
      OR existing.checks_before_json IS NOT NEW.checks_before_json
      OR existing.checks_after_json IS NOT NEW.checks_after_json
      OR existing.related_event_ids_json IS NOT NEW.related_event_ids_json
      OR existing.last_verified_at IS NOT NEW.last_verified_at
      OR existing.stale_after IS NOT NEW.stale_after
      OR existing.created_at IS NOT NEW.created_at
    )
)
BEGIN
  SELECT RAISE(ABORT, 'market event replay payload mismatch');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0017_market_event_replay_payload', datetime('now'));
