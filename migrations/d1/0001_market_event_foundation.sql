PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_events (
  event_id TEXT PRIMARY KEY CHECK (event_id LIKE 'evt_%'),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  occurrence_key TEXT NOT NULL,
  issuer_code TEXT,
  issuer_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'EARNINGS_RELEASE', 'EARNINGS_BRIEFING', 'PRESS_CONFERENCE',
    'SHAREHOLDER_MEETING', 'CONTINUED_SHAREHOLDER_MEETING',
    'INVESTIGATION_UPDATE', 'THIRD_PARTY_COMMITTEE_REPORT',
    'REGULATORY_ACTION', 'AUDIT_OPINION', 'CORRECTED_DISCLOSURE',
    'JPX_REMEDIATION_REPORT', 'JPX_REMEDIATION_STATUS_REPORT',
    'TOB_DEADLINE', 'CORPORATE_ACTION', 'CERTIFICATION_OR_APPROVAL',
    'PROCUREMENT_OR_AWARD', 'CAPACITY_OR_PRODUCTION_START',
    'REVIEW_CHECKPOINT', 'OTHER'
  )),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'TENTATIVE', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED',
    'POSTPONED', 'CANCELLED', 'UNKNOWN_DATE'
  )),
  priority TEXT NOT NULL CHECK (priority IN ('S0', 'S1', 'S2', 'S3')),
  start_at TEXT,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  time_precision TEXT NOT NULL CHECK (time_precision IN ('EXACT', 'DATE_ONLY', 'WINDOW', 'UNKNOWN')),
  window_start TEXT,
  window_end TEXT,
  edge_types_json TEXT NOT NULL DEFAULT '[]',
  current_decision_state TEXT NOT NULL CHECK (current_decision_state IN ('BUY_WATCH', 'WAIT', 'BLOCK', 'ABSTAIN', 'INFO')),
  why_it_matters TEXT NOT NULL DEFAULT '',
  checks_before_json TEXT NOT NULL DEFAULT '[]',
  checks_after_json TEXT NOT NULL DEFAULT '[]',
  related_event_ids_json TEXT NOT NULL DEFAULT '[]',
  current_revision_id TEXT,
  last_verified_at TEXT NOT NULL,
  stale_after TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (time_precision = 'UNKNOWN' AND all_day = 0 AND start_at IS NULL AND end_at IS NULL AND window_start IS NULL AND window_end IS NULL)
    OR (time_precision = 'WINDOW' AND all_day = 1 AND start_at IS NULL AND end_at IS NULL AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start <= window_end)
    OR (time_precision = 'DATE_ONLY' AND all_day = 1 AND start_at IS NOT NULL AND window_start IS NULL AND window_end IS NULL)
    OR (time_precision = 'EXACT' AND all_day = 0 AND start_at IS NOT NULL AND window_start IS NULL AND window_end IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS event_revisions (
  revision_id TEXT PRIMARY KEY CHECK (revision_id LIKE 'rev_%'),
  event_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  observed_at TEXT NOT NULL,
  published_at TEXT,
  effective_at TEXT,
  first_executable_at TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('CREATED', 'UPDATED', 'POSTPONED', 'CANCELLED', 'COMPLETED')),
  facts_json TEXT NOT NULL,
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  previous_revision_id TEXT,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id),
  FOREIGN KEY (previous_revision_id) REFERENCES event_revisions(revision_id),
  UNIQUE (event_id, revision_number)
);

CREATE TABLE IF NOT EXISTS event_sources (
  source_id TEXT PRIMARY KEY CHECK (source_id LIKE 'src_%'),
  event_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  authority TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('IR', 'TDNET', 'JPX', 'EDINET', 'REGULATOR', 'COURT', 'MAJOR_MEDIA', 'OTHER')),
  url TEXT NOT NULL CHECK (url LIKE 'https://%'),
  title TEXT NOT NULL,
  published_at TEXT,
  retrieved_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  storage_class TEXT NOT NULL CHECK (storage_class IN (
    'METADATA_ONLY', 'PUBLIC_OFFICIAL_DOCUMENT_PRIVATE_COPY',
    'LICENSED_LOCAL_ONLY', 'LICENSED_CLOUD_PRIVATE_ALLOWED', 'NO_PERSISTENCE'
  )),
  object_key TEXT,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id),
  UNIQUE (authority, url, content_hash)
);

CREATE TABLE IF NOT EXISTS decision_snapshots (
  decision_snapshot_id TEXT PRIMARY KEY CHECK (decision_snapshot_id LIKE 'dec_%'),
  event_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  decision_state TEXT NOT NULL CHECK (decision_state IN ('BUY_WATCH', 'WAIT', 'BLOCK', 'ABSTAIN', 'INFO')),
  confidence_state TEXT NOT NULL CHECK (confidence_state IN ('CONFIRMED', 'PARTIAL', 'UNKNOWN')),
  reasons_json TEXT NOT NULL,
  invalidation_conditions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id),
  FOREIGN KEY (revision_id) REFERENCES event_revisions(revision_id)
);

CREATE TABLE IF NOT EXISTS delivery_outbox (
  delivery_id TEXT PRIMARY KEY CHECK (delivery_id LIKE 'dlv_%'),
  delivery_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  channel TEXT NOT NULL CHECK (channel IN ('LINE', 'WEB_PUSH', 'GOOGLE_CALENDAR', 'ICS_FEED', 'IN_APP')),
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
  FOREIGN KEY (revision_id) REFERENCES event_revisions(revision_id),
  UNIQUE (event_id, revision_id, channel, delivery_key, scheduled_at)
);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  delivery_id TEXT PRIMARY KEY,
  provider_message_id TEXT,
  delivered_at TEXT NOT NULL,
  response_hash TEXT,
  FOREIGN KEY (delivery_id) REFERENCES delivery_outbox(delivery_id)
);

CREATE TABLE IF NOT EXISTS calendar_sync_state (
  event_id TEXT NOT NULL,
  calendar_provider TEXT NOT NULL CHECK (calendar_provider IN ('ICS_FEED', 'GOOGLE_CALENDAR')),
  calendar_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  last_synced_revision_id TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('PENDING', 'SYNCED', 'FAILED', 'REMOVED')),
  last_error TEXT,
  PRIMARY KEY (event_id, calendar_provider, calendar_id),
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

CREATE TABLE IF NOT EXISTS review_tasks (
  review_task_id TEXT PRIMARY KEY CHECK (review_task_id LIKE 'tsk_%'),
  event_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  due_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
  priority TEXT NOT NULL CHECK (priority IN ('S0', 'S1', 'S2', 'S3')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES market_events(event_id),
  UNIQUE (event_id, task_type, due_at)
);

CREATE INDEX IF NOT EXISTS idx_market_events_date_priority
  ON market_events(start_at, priority, status);

CREATE INDEX IF NOT EXISTS idx_market_events_window
  ON market_events(window_start, window_end, priority);

CREATE INDEX IF NOT EXISTS idx_market_events_issuer
  ON market_events(issuer_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_events_decision
  ON market_events(current_decision_state, priority, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_revisions_event
  ON event_revisions(event_id, revision_number DESC);

CREATE INDEX IF NOT EXISTS idx_event_sources_event
  ON event_sources(event_id, published_at, retrieved_at);

CREATE INDEX IF NOT EXISTS idx_delivery_outbox_pending
  ON delivery_outbox(state, scheduled_at, attempt_count);

CREATE INDEX IF NOT EXISTS idx_delivery_outbox_lease
  ON delivery_outbox(state, lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_event
  ON decision_snapshots(event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_tasks_due
  ON review_tasks(state, due_at, priority);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0001_market_event_foundation', datetime('now'));
