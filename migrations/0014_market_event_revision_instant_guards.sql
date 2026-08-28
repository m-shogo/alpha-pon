CREATE TRIGGER IF NOT EXISTS trg_event_revision_instant_guards
BEFORE INSERT ON event_revisions
WHEN julianday(NEW.observed_at) IS NULL
  OR substr(NEW.observed_at, 11, 1) != 'T'
  OR NOT (
    substr(NEW.observed_at, -1) = 'Z'
    OR (
      length(NEW.observed_at) >= 6
      AND substr(NEW.observed_at, -6, 1) IN ('+', '-')
      AND substr(NEW.observed_at, -5, 2) GLOB '[0-9][0-9]'
      AND substr(NEW.observed_at, -3, 1) = ':'
      AND substr(NEW.observed_at, -2, 2) GLOB '[0-9][0-9]'
      AND CAST(substr(NEW.observed_at, -2, 2) AS INTEGER) <= 59
      AND (
        CAST(substr(NEW.observed_at, -5, 2) AS INTEGER) < 14
        OR (
          CAST(substr(NEW.observed_at, -5, 2) AS INTEGER) = 14
          AND CAST(substr(NEW.observed_at, -2, 2) AS INTEGER) = 0
        )
      )
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
          AND substr(NEW.published_at, -5, 2) GLOB '[0-9][0-9]'
          AND substr(NEW.published_at, -3, 1) = ':'
          AND substr(NEW.published_at, -2, 2) GLOB '[0-9][0-9]'
          AND CAST(substr(NEW.published_at, -2, 2) AS INTEGER) <= 59
          AND (
            CAST(substr(NEW.published_at, -5, 2) AS INTEGER) < 14
            OR (
              CAST(substr(NEW.published_at, -5, 2) AS INTEGER) = 14
              AND CAST(substr(NEW.published_at, -2, 2) AS INTEGER) = 0
            )
          )
        )
      )
    )
  )
  OR (
    NEW.effective_at IS NOT NULL
    AND (
      julianday(NEW.effective_at) IS NULL
      OR substr(NEW.effective_at, 11, 1) != 'T'
      OR NOT (
        substr(NEW.effective_at, -1) = 'Z'
        OR (
          length(NEW.effective_at) >= 6
          AND substr(NEW.effective_at, -6, 1) IN ('+', '-')
          AND substr(NEW.effective_at, -5, 2) GLOB '[0-9][0-9]'
          AND substr(NEW.effective_at, -3, 1) = ':'
          AND substr(NEW.effective_at, -2, 2) GLOB '[0-9][0-9]'
          AND CAST(substr(NEW.effective_at, -2, 2) AS INTEGER) <= 59
          AND (
            CAST(substr(NEW.effective_at, -5, 2) AS INTEGER) < 14
            OR (
              CAST(substr(NEW.effective_at, -5, 2) AS INTEGER) = 14
              AND CAST(substr(NEW.effective_at, -2, 2) AS INTEGER) = 0
            )
          )
        )
      )
    )
  )
  OR (
    NEW.first_executable_at IS NOT NULL
    AND (
      julianday(NEW.first_executable_at) IS NULL
      OR substr(NEW.first_executable_at, 11, 1) != 'T'
      OR NOT (
        substr(NEW.first_executable_at, -1) = 'Z'
        OR (
          length(NEW.first_executable_at) >= 6
          AND substr(NEW.first_executable_at, -6, 1) IN ('+', '-')
          AND substr(NEW.first_executable_at, -5, 2) GLOB '[0-9][0-9]'
          AND substr(NEW.first_executable_at, -3, 1) = ':'
          AND substr(NEW.first_executable_at, -2, 2) GLOB '[0-9][0-9]'
          AND CAST(substr(NEW.first_executable_at, -2, 2) AS INTEGER) <= 59
          AND (
            CAST(substr(NEW.first_executable_at, -5, 2) AS INTEGER) < 14
            OR (
              CAST(substr(NEW.first_executable_at, -5, 2) AS INTEGER) = 14
              AND CAST(substr(NEW.first_executable_at, -2, 2) AS INTEGER) = 0
            )
          )
        )
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'event revision timestamps must be explicit-timezone ISO instants');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0014_market_event_revision_instant_guards', datetime('now'));
