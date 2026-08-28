CREATE TRIGGER IF NOT EXISTS trg_event_source_retrieved_at_instant
BEFORE INSERT ON event_sources
WHEN julianday(NEW.retrieved_at) IS NULL
  OR substr(NEW.retrieved_at, 11, 1) != 'T'
  OR NOT (
    substr(NEW.retrieved_at, -1) = 'Z'
    OR (
      length(NEW.retrieved_at) >= 6
      AND substr(NEW.retrieved_at, -6, 1) IN ('+', '-')
      AND substr(NEW.retrieved_at, -3, 1) = ':'
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'event source retrieved_at must be an explicit-timezone ISO instant');
END;

CREATE TRIGGER IF NOT EXISTS trg_event_source_published_at_instant
BEFORE INSERT ON event_sources
WHEN NEW.published_at IS NOT NULL
  AND (
    julianday(NEW.published_at) IS NULL
    OR substr(NEW.published_at, 11, 1) != 'T'
    OR NOT (
      substr(NEW.published_at, -1) = 'Z'
      OR (
        length(NEW.published_at) >= 6
        AND substr(NEW.published_at, -6, 1) IN ('+', '-')
        AND substr(NEW.published_at, -3, 1) = ':'
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'event source published_at must be an explicit-timezone ISO instant');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0013_market_event_source_instant_guards', datetime('now'));
