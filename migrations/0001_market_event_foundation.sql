PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS market_events (
  event_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  issuer_code TEXT,
  issuer_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  start_at TEXT,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  time_precision TEXT NOT NULL,
  window_start TEXT,
  window_end TEXT,
  edge_types_json TEXT NOT NULL DEFAULT '[]',
  current_decision_state TEXT NOT NULL,
  why_it_matters TEXT NOT NULL DEFAULT '',
  checks_before_json TEXT NOT NULL DEFAULT '[]',
  checks_after_json TEXT NOT NULL DEFAULT '[]',
  current_revision_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (time_precision = 'UNKNOWN' AND start_at IS NULL AND end_at IS NULL AND window_start IS NULL AND window_end IS NULL)
    OR (time_precision = 'WINDOW' AND start_at IS NULL AND end_at IS NULL AND window_start IS NOT NULL AND window_end IS NOT NULL)
    OR (time_precision IN ('EXACT', 'DATE_ONLY') AND start_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS event_revisions (
  revision_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  observed_at TEXT NOT NULL,
  published_at TEXT,
  effective_at TEXT,
  first_executable_at TEXT,
  change_type TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  previous_revision_id TEXT,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id),
  FOREIGN KEY (previous_revision_id) REFERENCES event_revisions(revision_id),
  UNIQUE (event_id, revision_number)
);

CREATE TABLE IF NOT EXISTS event_sources (
  source_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  authority TEXT NOT NULL,
  source_type TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TEXT,
  retrieved_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  storage_class TEXT NOT NULL,
  object_key TEXT,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id),
  UNIQUE (authority, url, content_hash)
);

CREATE TABLE IF NOT EXISTS decision_snapshots (
  decision_snapshot_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  decision_state TEXT NOT NULL,
  confidence_state TEXT NOT NULL,
  reason_json TEXT NOT NULL,
  invalidation_conditions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id),
  FOREIGN KEY (revision_id) REFERENCES event_revisions(revision_id)
);

CREATE TABLE IF NOT EXISTS delivery_outbox (
  delivery_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER')),
  payload_json TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at TEXT,
  delivered_at TEXT,
  last_error TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id),
  FOREIGN KEY (revision_id) REFERENCES event_revisions(revision_id)
);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  delivery_id TEXT PRIMARY KEY,
  provider_message_id TEXT,
  delivered_at TEXT NOT NULL,
  response_hash TEXT,
  FOREIGN KEY (delivery_id) REFERENCES delivery_outbox(delivery_id)
);

CREATE TABLE IF NOT EXISTS calendar_sync_state (
  event_id TEXT PRIMARY KEY,
  calendar_provider TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  last_synced_revision_id TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  sync_status TEXT NOT NULL,
  last_error TEXT,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id),
  FOREIGN KEY (last_synced_revision_id) REFERENCES event_revisions(revision_id),
  UNIQUE (calendar_provider, calendar_id, provider_event_id)
);

CREATE TABLE IF NOT EXISTS source_checkpoints (
  source_key TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  cursor_value TEXT,
  etag TEXT,
  last_modified TEXT,
  last_content_hash TEXT,
  last_checked_at TEXT NOT NULL,
  last_success_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  next_check_at TEXT,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_market_events_date_priority
  ON market_events(start_at, priority, status);

CREATE INDEX IF NOT EXISTS idx_market_events_issuer
  ON market_events(issuer_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_revisions_event
  ON event_revisions(event_id, revision_number DESC);

CREATE INDEX IF NOT EXISTS idx_event_sources_event
  ON event_sources(event_id, published_at, retrieved_at);

CREATE INDEX IF NOT EXISTS idx_delivery_outbox_pending
  ON delivery_outbox(state, scheduled_at, attempt_count);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_event
  ON decision_snapshots(event_id, created_at DESC);
