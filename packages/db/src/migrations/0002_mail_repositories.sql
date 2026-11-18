-- Mail repositories: accounts, messages, threads, derived data, signals, sender stats, suggestions,
-- the append-only action log, an ingest sequence, and an FTS5 index over metadata and derived data.
-- D11 (ADR 0009): metadata only. No column here can hold a message body or an attachment: the
-- text columns are the capped subject and snippet, addresses, ids, enums and short reason strings.

CREATE TABLE account (
  workspace_id TEXT NOT NULL,
  id           TEXT NOT NULL,
  provider     TEXT NOT NULL,
  address      TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
) STRICT;

-- One row holds the last ingest sequence handed out. A counter (not rowid) keeps it monotonic
-- even when an account's rows are deleted, so a digest cursor can never point past new mail.
CREATE TABLE ingest_counter (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  value INTEGER NOT NULL
) STRICT;
INSERT INTO ingest_counter (id, value) VALUES (1, 0);

CREATE TABLE message (
  workspace_id          TEXT NOT NULL,
  id                    TEXT NOT NULL,
  account_id            TEXT NOT NULL,
  thread_id             TEXT NOT NULL,
  sender                TEXT NOT NULL,
  recipients            TEXT NOT NULL,
  subject               TEXT NOT NULL CHECK (length(subject) <= 4000),
  -- Capped like the sync use case caps it (MAX_SNIPPET_CHARS): a message body cannot fit.
  snippet               TEXT NOT NULL CHECK (length(snippet) <= 200),
  received_at           TEXT NOT NULL,
  has_list_unsubscribe  INTEGER NOT NULL,
  opened                INTEGER NOT NULL,
  topic_ids             TEXT NOT NULL,
  suspicious_reasons    TEXT CHECK (length(suspicious_reasons) <= 2000),
  suspicious_confidence REAL,
  category              TEXT NOT NULL,
  ingest_seq            INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, id)
) STRICT;
-- Every list/filter query: account (+ category | sender) newest first, and the ingest sequence.
CREATE INDEX message_by_account_date ON message (workspace_id, account_id, received_at DESC, id);
CREATE INDEX message_by_category ON message (workspace_id, account_id, category, received_at DESC, id);
CREATE INDEX message_by_sender ON message (workspace_id, account_id, sender, received_at DESC, id);
CREATE INDEX message_by_ingest ON message (workspace_id, account_id, ingest_seq);

CREATE TABLE thread (
  workspace_id    TEXT NOT NULL,
  id              TEXT NOT NULL,
  account_id      TEXT NOT NULL,
  subject         TEXT NOT NULL CHECK (length(subject) <= 4000),
  message_ids     TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
) STRICT;
CREATE INDEX thread_by_account ON thread (workspace_id, account_id, last_message_at DESC);

CREATE TABLE derived (
  workspace_id  TEXT NOT NULL,
  message_id    TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  category      TEXT NOT NULL,
  reason        TEXT NOT NULL CHECK (length(reason) <= 500),
  confidence    REAL NOT NULL,
  model_version TEXT NOT NULL,
  template_hash TEXT,
  embedding_ref TEXT,
  snippet       TEXT NOT NULL CHECK (length(snippet) <= 120),
  derived_at    TEXT NOT NULL,
  PRIMARY KEY (workspace_id, message_id)
) STRICT;
CREATE INDEX derived_by_account ON derived (workspace_id, account_id, message_id);

CREATE TABLE signal (
  workspace_id TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  kind         TEXT NOT NULL,
  confidence   REAL NOT NULL,
  detected_at  TEXT NOT NULL,
  reason       TEXT NOT NULL CHECK (length(reason) <= 500),
  PRIMARY KEY (workspace_id, message_id, kind)
) STRICT;

CREATE TABLE sender_stats (
  workspace_id    TEXT NOT NULL,
  account_id      TEXT NOT NULL,
  address         TEXT NOT NULL,
  message_count   INTEGER NOT NULL,
  opened_count    INTEGER NOT NULL,
  replied_count   INTEGER NOT NULL,
  last_message_at TEXT NOT NULL,
  vip             INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, account_id, address)
) STRICT;

CREATE TABLE suggestion (
  workspace_id TEXT NOT NULL,
  id           TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  state        TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'dismissed')),
  confidence   REAL NOT NULL,
  created_at   TEXT NOT NULL,
  command      TEXT NOT NULL,
  reasons      TEXT NOT NULL CHECK (length(reasons) <= 2000),
  PRIMARY KEY (workspace_id, id)
) STRICT;
CREATE INDEX suggestion_by_state ON suggestion (workspace_id, state, created_at, id);

CREATE TABLE action_log (
  seq                 INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id        TEXT NOT NULL,
  id                  TEXT NOT NULL,
  action_id           TEXT NOT NULL,
  idempotency_key     TEXT NOT NULL,
  batch_id            TEXT,
  outcome             TEXT NOT NULL,
  -- The account the entry's messages belong to (when known), so removal can anonymise it.
  account_id          TEXT,
  -- Kept when the payload is anonymised on account removal (audit: what kind, how many).
  command_kind        TEXT NOT NULL,
  message_count       INTEGER NOT NULL,
  inverse_kind        TEXT,
  -- NULL once anonymised: message ids and label names are gone, the rest of the entry stays.
  command             TEXT,
  inverse             TEXT,
  irreversible        INTEGER NOT NULL,
  irreversible_reason TEXT,
  error_code          TEXT,
  denial_reason       TEXT,
  at                  TEXT NOT NULL,
  UNIQUE (workspace_id, id)
) STRICT;
CREATE INDEX action_log_by_action ON action_log (workspace_id, action_id, at);
CREATE INDEX action_log_by_key ON action_log (workspace_id, idempotency_key, at);
CREATE INDEX action_log_by_batch ON action_log (workspace_id, batch_id, at);
CREATE INDEX action_log_by_account ON action_log (workspace_id, account_id);
-- Append-only: undo appends an `undone` entry; nothing rewrites or removes one. The one exception is
-- account removal, which nulls the payloads (`command`, `inverse`) while `removal_guard` is raised.
CREATE TABLE removal_guard (
  id     INTEGER PRIMARY KEY CHECK (id = 1),
  active INTEGER NOT NULL
) STRICT;
INSERT INTO removal_guard (id, active) VALUES (1, 0);
CREATE TRIGGER action_log_no_update BEFORE UPDATE ON action_log
WHEN (SELECT active FROM removal_guard) = 0
  OR new.command IS NOT NULL OR new.inverse IS NOT NULL
  OR new.seq IS NOT old.seq OR new.workspace_id IS NOT old.workspace_id OR new.id IS NOT old.id
  OR new.action_id IS NOT old.action_id OR new.idempotency_key IS NOT old.idempotency_key
  OR new.batch_id IS NOT old.batch_id OR new.outcome IS NOT old.outcome OR new.at IS NOT old.at
  OR new.account_id IS NOT old.account_id OR new.command_kind IS NOT old.command_kind
  OR new.message_count IS NOT old.message_count OR new.inverse_kind IS NOT old.inverse_kind
  OR new.irreversible IS NOT old.irreversible
BEGIN SELECT RAISE(ABORT, 'the action log is append-only'); END;
CREATE TRIGGER action_log_no_delete BEFORE DELETE ON action_log
BEGIN SELECT RAISE(ABORT, 'the action log is append-only'); END;

-- Pending events and jobs carry the account in their payload; a column lets removal purge them.
ALTER TABLE outbox ADD COLUMN account_id TEXT;
ALTER TABLE job ADD COLUMN account_id TEXT;
CREATE INDEX outbox_by_account ON outbox (workspace_id, account_id) WHERE account_id IS NOT NULL;
CREATE INDEX job_by_account ON job (workspace_id, account_id) WHERE account_id IS NOT NULL;

-- The digest cursor follows the ingest sequence, not the message date (late mail is not missed).
ALTER TABLE digest_state ADD COLUMN last_sequence INTEGER NOT NULL DEFAULT 0;

-- Full-text search over sender, subject, snippet, category and signals. Metadata and derived data
-- only: there is no body to index (ADR 0009). Rows are keyed by the message rowid and kept in sync
-- by the triggers below, so every write path (and account removal) updates the index.
CREATE VIRTUAL TABLE message_search USING fts5(
  sender, subject, snippet, category, signals,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER message_search_insert AFTER INSERT ON message
BEGIN
  INSERT INTO message_search (rowid, sender, subject, snippet, category, signals)
  VALUES (new.rowid, new.sender, new.subject, new.snippet, new.category,
    (SELECT coalesce(group_concat(kind, ' '), '') FROM signal
      WHERE workspace_id = new.workspace_id AND message_id = new.id));
END;
CREATE TRIGGER message_search_update AFTER UPDATE ON message
BEGIN
  DELETE FROM message_search WHERE rowid = old.rowid;
  INSERT INTO message_search (rowid, sender, subject, snippet, category, signals)
  VALUES (new.rowid, new.sender, new.subject, new.snippet, new.category,
    (SELECT coalesce(group_concat(kind, ' '), '') FROM signal
      WHERE workspace_id = new.workspace_id AND message_id = new.id));
END;
CREATE TRIGGER message_search_delete AFTER DELETE ON message
BEGIN
  DELETE FROM message_search WHERE rowid = old.rowid;
END;

-- A signal change rewrites the message's `signals` column (delete + insert keeps FTS5 consistent).
CREATE TRIGGER signal_search_insert AFTER INSERT ON signal
BEGIN
  DELETE FROM message_search WHERE rowid IN
    (SELECT rowid FROM message WHERE workspace_id = new.workspace_id AND id = new.message_id);
  INSERT INTO message_search (rowid, sender, subject, snippet, category, signals)
  SELECT m.rowid, m.sender, m.subject, m.snippet, m.category,
    (SELECT coalesce(group_concat(kind, ' '), '') FROM signal
      WHERE workspace_id = m.workspace_id AND message_id = m.id)
  FROM message m WHERE m.workspace_id = new.workspace_id AND m.id = new.message_id;
END;
CREATE TRIGGER signal_search_delete AFTER DELETE ON signal
BEGIN
  DELETE FROM message_search WHERE rowid IN
    (SELECT rowid FROM message WHERE workspace_id = old.workspace_id AND id = old.message_id);
  INSERT INTO message_search (rowid, sender, subject, snippet, category, signals)
  SELECT m.rowid, m.sender, m.subject, m.snippet, m.category,
    (SELECT coalesce(group_concat(kind, ' '), '') FROM signal
      WHERE workspace_id = m.workspace_id AND message_id = m.id)
  FROM message m WHERE m.workspace_id = old.workspace_id AND m.id = old.message_id;
END;
