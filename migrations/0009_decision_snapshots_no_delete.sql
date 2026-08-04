CREATE TRIGGER IF NOT EXISTS trg_decision_snapshots_no_delete BEFORE DELETE ON decision_snapshots BEGIN SELECT RAISE(ABORT, 'decision_snapshots is append-only'); END;
