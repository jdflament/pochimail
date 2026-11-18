-- Core tables: transactional outbox, leased job queue (with dead letters), sync cursors, topics and digest state.
-- D11 (ADR 0009): metadata only. No message bodies or attachments are ever stored here.

CREATE TABLE outbox (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL CHECK (kind IN ('event', 'job')),
  workspace_id TEXT NOT NULL,
  payload      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  delivered_at TEXT
) STRICT;
CREATE INDEX outbox_undelivered ON outbox (seq) WHERE delivered_at IS NULL;

CREATE TABLE job (
  seq              INTEGER PRIMARY KEY AUTOINCREMENT,
  id               TEXT NOT NULL UNIQUE,
  workspace_id     TEXT NOT NULL,
  type             TEXT NOT NULL,
  payload          TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  state            TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'done', 'dead')),
  run_at           TEXT,
  run_at_ms        INTEGER NOT NULL DEFAULT 0,
  attempts         INTEGER NOT NULL DEFAULT 0,
  lease            TEXT,
  lease_expires_ms INTEGER NOT NULL DEFAULT 0,
  error_code       TEXT,
  finished_ms      INTEGER,
  UNIQUE (workspace_id, idempotency_key)
) STRICT;
CREATE INDEX job_claimable ON job (type, state, run_at_ms);

CREATE TABLE cursor (
  workspace_id TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  scope        TEXT NOT NULL,
  token        TEXT NOT NULL,
  PRIMARY KEY (workspace_id, account_id, scope)
) STRICT;

CREATE TABLE topic (
  workspace_id TEXT NOT NULL,
  id           TEXT NOT NULL,
  data         TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
) STRICT;

CREATE TABLE digest_state (
  workspace_id    TEXT NOT NULL,
  account_id      TEXT NOT NULL,
  last_digest_at  TEXT NOT NULL,
  PRIMARY KEY (workspace_id, account_id)
) STRICT;
