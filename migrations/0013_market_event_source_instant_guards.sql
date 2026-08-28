CREATE TRIGGER IF NOT EXISTS trg_event_source_instant_guards
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
  OR (
    NEW.published_at IS NOT NULL
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
  )
BEGIN
  SELECT CASE
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
    THEN RAISE(ABORT, 'event source retrieved_at must be an explicit-timezone ISO instant')
    ELSE RAISE(ABORT, 'event source published_at must be an explicit-timezone ISO instant')
  END;
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0013_market_event_source_instant_guards', datetime('now'));
