CREATE TRIGGER IF NOT EXISTS trg_event_sources_no_delete BEFORE DELETE ON event_sources BEGIN SELECT RAISE(ABORT, 'event_sources is append-only'); END;
