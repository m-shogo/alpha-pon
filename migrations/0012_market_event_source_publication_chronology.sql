CREATE TRIGGER IF NOT EXISTS trg_event_source_publication_chronology
BEFORE INSERT ON event_sources
WHEN NEW.published_at IS NOT NULL
  AND julianday(NEW.published_at) > julianday(NEW.retrieved_at)
BEGIN
  SELECT RAISE(ABORT, 'event source published_at must be on or before retrieved_at');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0012_market_event_source_publication_chronology', datetime('now'));
