CREATE TRIGGER IF NOT EXISTS trg_event_source_offset_bounds
BEFORE INSERT ON event_sources
WHEN (
    substr(NEW.retrieved_at, -1) != 'Z'
    AND (
      substr(NEW.retrieved_at, -5, 2) NOT GLOB '[0-9][0-9]'
      OR substr(NEW.retrieved_at, -2, 2) NOT GLOB '[0-9][0-9]'
      OR CAST(substr(NEW.retrieved_at, -2, 2) AS INTEGER) > 59
      OR CAST(substr(NEW.retrieved_at, -5, 2) AS INTEGER) > 14
      OR (
        CAST(substr(NEW.retrieved_at, -5, 2) AS INTEGER) = 14
        AND CAST(substr(NEW.retrieved_at, -2, 2) AS INTEGER) != 0
      )
    )
  )
  OR (
    NEW.published_at IS NOT NULL
    AND substr(NEW.published_at, -1) != 'Z'
    AND (
      substr(NEW.published_at, -5, 2) NOT GLOB '[0-9][0-9]'
      OR substr(NEW.published_at, -2, 2) NOT GLOB '[0-9][0-9]'
      OR CAST(substr(NEW.published_at, -2, 2) AS INTEGER) > 59
      OR CAST(substr(NEW.published_at, -5, 2) AS INTEGER) > 14
      OR (
        CAST(substr(NEW.published_at, -5, 2) AS INTEGER) = 14
        AND CAST(substr(NEW.published_at, -2, 2) AS INTEGER) != 0
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'event source timezone offset must be within +/-14:00');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0015_market_event_source_offset_bounds', datetime('now'));
