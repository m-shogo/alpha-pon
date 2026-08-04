CREATE TRIGGER IF NOT EXISTS trg_event_revisions_no_update BEFORE UPDATE ON event_revisions BEGIN SELECT RAISE(ABORT, 'event_revisions is append-only'); END;
