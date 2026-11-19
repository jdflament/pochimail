import { redactRecord } from "./redaction.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogRecord = {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
};

/** Receives only already-redacted records. Concrete sinks live in adapters. */
export interface LogSink {
  write(record: LogRecord): void;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export function createLogger(options: { sink: LogSink }): Logger {
  return build(options.sink, {});
}

function build(sink: LogSink, bound: Record<string, unknown>): Logger {
  const emit = (level: LogLevel, message: string, fields?: Record<string, unknown>) => {
    const redacted = redactRecord(message, { ...bound, ...fields });
    sink.write({ level, message: redacted.message, fields: redacted.fields });
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (fields) => build(sink, { ...bound, ...fields }),
  };
}
