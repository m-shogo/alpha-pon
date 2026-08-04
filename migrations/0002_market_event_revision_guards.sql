PRAGMA foreign_keys = ON;

-- Idempotent replays of an existing revision_id are allowed by INSERT OR IGNORE.
-- Any genuinely new revision must extend the current chain by exactly one.
CREATE TRIGGER IF NOT EXISTS trg_event_revision_continuity
BEFORE INSERT ON event_revisions
WHEN NOT EXISTS (
  SELECT 1 FROM event_revisions existing
  WHERE existing.revision_id = NEW.revision_id
)
BEGIN
  SELECT CASE
    WHEN NEW.revision_number != (
      SELECT COALESCE(MAX(revision_number), 0) + 1
      FROM event_revisions
      WHERE event_id = NEW.event_id
    )
    THEN RAISE(ABORT, 'event revision number must extend the latest revision by one')
  END;

  SELECT CASE
    WHEN NEW.revision_number = 1 AND NEW.previous_revision_id IS NOT NULL
    THEN RAISE(ABORT, 'first event revision must not reference a previous revision')
  END;

  SELECT CASE
    WHEN NEW.revision_number > 1 AND COALESCE(NEW.previous_revision_id, '') != COALESCE((
      SELECT revision_id
      FROM event_revisions
      WHERE event_id = NEW.event_id
      ORDER BY revision_number DESC
      LIMIT 1
    ), '')
    THEN RAISE(ABORT, 'event revision previous_revision_id must reference the latest revision')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM event_revisions latest
      WHERE latest.event_id = NEW.event_id
        AND latest.revision_number = (
          SELECT MAX(revision_number)
          FROM event_revisions
          WHERE event_id = NEW.event_id
        )
        AND julianday(NEW.observed_at) < julianday(latest.observed_at)
    )
    THEN RAISE(ABORT, 'event revision observed_at must not move backwards')
  END;

  -- Runtime registration upserts the current projection before appending the
  -- revision. Reject a revision older than that established current pointer.
  -- During a fresh history bootstrap, market_events.current_revision_id is
  -- deliberately NULL until the latest historical revision is reached.
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM market_events current_event
      WHERE current_event.event_id = NEW.event_id
        AND current_event.current_revision_id IS NOT NULL
        AND julianday(NEW.observed_at) < julianday(current_event.updated_at)
    )
    THEN RAISE(ABORT, 'event revision is older than the current event projection')
  END;
END;

-- The current pointer is derived from the append-only ledger. A bootstrap
-- inserts the latest projection with a NULL pointer and then replays revisions
-- oldest-first; only the revision reaching the projection's updated_at becomes
-- current. Normal runtime writes have matching observed_at/updated_at and are
-- promoted immediately.
CREATE TRIGGER IF NOT EXISTS trg_event_revision_promote_current
AFTER INSERT ON event_revisions
BEGIN
  UPDATE market_events
  SET current_revision_id = NEW.revision_id
  WHERE event_id = NEW.event_id
    AND julianday(NEW.observed_at) >= julianday(updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_event_revisions_no_update
BEFORE UPDATE ON event_revisions
BEGIN
  SELECT RAISE(ABORT, 'event_revisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_event_revisions_no_delete
BEFORE DELETE ON event_revisions
BEGIN
  SELECT RAISE(ABORT, 'event_revisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_event_sources_no_update
BEFORE UPDATE ON event_sources
BEGIN
  SELECT RAISE(ABORT, 'event_sources is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_event_sources_no_delete
BEFORE DELETE ON event_sources
BEGIN
  SELECT RAISE(ABORT, 'event_sources is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_decision_snapshots_no_update
BEFORE UPDATE ON decision_snapshots
BEGIN
  SELECT RAISE(ABORT, 'decision_snapshots is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_decision_snapshots_no_delete
BEFORE DELETE ON decision_snapshots
BEGIN
  SELECT RAISE(ABORT, 'decision_snapshots is append-only');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0002_market_event_revision_guards', datetime('now'));
