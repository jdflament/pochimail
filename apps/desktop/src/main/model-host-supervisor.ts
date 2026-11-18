import type { Timer } from "@pochimail/core/events/batching";
import type { Logger } from "@pochimail/core/logger";
import type { MessageChannelMain, MessagePortMain } from "electron";
import { hostPongSchema } from "../shared/model-host-protocol.ts";

/** The slice of a `utilityProcess` the supervisor drives. */
export interface HostProcess {
  postMessage(message: unknown, transfer?: MessagePortMain[]): void;
  on(event: "message", listener: (message: unknown) => void): void;
  on(event: "exit", listener: (code: number) => void): void;
  kill(): void;
}

export interface ModelHostSupervisorOptions {
  fork: () => HostProcess;
  /** The worker the model port is handed to. */
  worker: { postMessage: (message: unknown, transfer: MessagePortMain[]) => void };
  createChannel: () => Pick<MessageChannelMain, "port1" | "port2">;
  timer: Timer;
  logger: Logger;
  /** Time between pings; a host that has not answered the previous ping by the next one is killed and restarted. */
  healthIntervalMs?: number;
  /** Restart delays: first, then doubling up to `maxBackoffMs`; reset once a host stayed up for `stableMs`. */
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  stableMs?: number;
}

export interface ModelHostSupervisor {
  /** Stops watching and kills the host. */
  stop(): void;
}

/**
 * Keeps one model host process alive for one worker: forks it, gives host and worker the two ends of a private port,
 * pings it, and restarts it (with a growing delay) when it exits or stops answering. Each restart hands the worker a new
 * port; the worker never restarts and keeps its scan going (ADR 0002). No mail data passes through here.
 */
export const superviseModelHost = (options: ModelHostSupervisorOptions): ModelHostSupervisor => {
  const healthIntervalMs = options.healthIntervalMs ?? 5_000;
  const initialBackoffMs = options.initialBackoffMs ?? 500;
  const maxBackoffMs = options.maxBackoffMs ?? 15_000;
  const stableMs = options.stableMs ?? 30_000;
  let stopped = false;
  let backoffMs = initialBackoffMs;
  let current: { host: HostProcess; cancelTimers: () => void } | undefined;

  const start = (): void => {
    if (stopped) return;
    const host = options.fork();
    const cancels = new Set<() => void>();
    const cancelTimers = (): void => {
      for (const cancel of cancels) cancel();
      cancels.clear();
    };
    const entry = { host, cancelTimers };
    current = entry;

    const { port1, port2 } = options.createChannel();
    host.postMessage({ type: "port" }, [port2]);
    options.worker.postMessage({ type: "model-port" }, [port1]);

    let ping = 0;
    let answered = true;
    let exited = false;
    const lost = (reason: "exited" | "unresponsive"): void => {
      if (exited) return;
      exited = true;
      cancelTimers();
      if (current === entry) current = undefined;
      if (reason === "unresponsive") host.kill();
      if (stopped) return;
      options.logger.warn(`model host ${reason}, restarting`, { operation: "model-host" });
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      options.timer.set(start, delay);
    };
    host.on("exit", () => lost("exited"));
    host.on("message", (message) => {
      if (hostPongSchema.safeParse(message).success) answered = true;
    });

    const beat = (): void => {
      if (exited || stopped) return;
      if (!answered) {
        lost("unresponsive");
        return;
      }
      answered = false;
      host.postMessage({ type: "ping", n: ping++ });
      cancels.add(options.timer.set(beat, healthIntervalMs));
    };
    cancels.add(options.timer.set(beat, healthIntervalMs));
    cancels.add(
      options.timer.set(() => {
        backoffMs = initialBackoffMs;
      }, stableMs),
    );
  };

  start();
  return {
    stop() {
      stopped = true;
      current?.cancelTimers();
      current?.host.kill();
      current = undefined;
    },
  };
};
