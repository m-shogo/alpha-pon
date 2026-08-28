CREATE TRIGGER IF NOT EXISTS trg_event_revision_publication_chronology
BEFORE INSERT ON event_revisions
WHEN NEW.published_at IS NOT NULL
  AND julianday(NEW.published_at) > julianday(NEW.observed_at)
BEGIN
  SELECT RAISE(ABORT, 'event revision published_at must be on or before observed_at');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0011_market_event_revision_publication_chronology', datetime('now'));
