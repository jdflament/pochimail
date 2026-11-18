import type { Timer } from "@pochimail/core/events/batching";
import { createLogger } from "@pochimail/core/logger";
import { demoScale } from "../shared/demo.ts";
import type { Handlers } from "../shared/ipc/server.ts";
import { serveRpc } from "../shared/ipc/server.ts";
import { createPlatformAdapter } from "../shared/platform.ts";
import { createWorkerApp } from "./app.ts";
import { createModelHostClient } from "./model-host-client.ts";
import { acceptPorts } from "./ports.ts";
import { acceptStart } from "./start.ts";

// Runs inside Electron's utilityProcess: the composition root of the app (M4-02).
const platform = createPlatformAdapter(process.platform, process.cwd());
const timer: Timer = {
  set: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  },
};
const logger = createLogger({
  sink: {
    write: (record) =>
      console.warn(
        JSON.stringify({ level: record.level, message: record.message, ...record.fields }),
      ),
  },
});

// Models run in their own process; main hands this worker a new port every time that process (re)starts.
const modelHost = createModelHostClient({ timer });
process.parentPort.on("message", (event) => {
  const type = (event.data as { type?: unknown } | null | undefined)?.type;
  if (type === "model-host-unavailable") modelHost.markUnavailable();
  if (type !== "model-port") return;
  const port = event.ports[0];
  if (port === undefined) return;
  modelHost.attach({
    post: (message) => port.postMessage(message),
    onMessage: (handler) => port.on("message", (portEvent) => handler(portEvent.data)),
    onClose: (handler) => port.on("close", handler),
    close: () => port.close(),
  });
  port.start();
});

// Until M2's real adapters exist only demo mode (fixture mailbox, dev/E2E) has data; otherwise every query answers empty.
const emptyHandlers: Handlers = {
  procedures: {
    "app.state": () => ({ status: "ready", hasConnectedAccount: false }),
    "device.name": () => platform.deviceName(),
    "accounts.list": () => [],
    "overview.get": () => ({ scanned: 0, toReview: 0 }),
    "mailbox.categories": () => ({
      people: 0,
      records: 0,
      "purchases-travel": 0,
      "sign-ins-security": 0,
      notifications: 0,
      newsletters: 0,
      promotions: 0,
    }),
    "digest.get": () => ({ ready: false, itemCount: 0 }),
    "settings.get": () => ({
      autonomy: "suggest" as const,
      capabilities: {
        "catch-what-matters": true,
        declutter: true,
        organize: true,
        "save-documents": true,
      },
      notifications: true,
    }),
  },
  subscriptions: {
    "app.events": () => undefined,
    "scan.progress": () => undefined,
  },
};

const scale = demoScale(process.env.POCHIMAIL_DEMO);
const handlers: Promise<Handlers> =
  scale === undefined
    ? Promise.resolve(emptyHandlers)
    : import("./fixture-adapters.ts")
        .then(({ createFixtureAdapters }) =>
          createFixtureAdapters({
            scale,
            timer,
            logger,
            deviceName: () => platform.deviceName(),
            classifier: modelHost.classifier,
            newJobId: () => crypto.randomUUID(),
          }),
        )
        .then((adapters) => createWorkerApp(adapters).handlers)
        .catch(() => {
          logger.error("demo data failed to load", { operation: "start" });
          return emptyHandlers;
        });

acceptPorts(process.parentPort, (port) => {
  let dispose: (() => void) | undefined;
  let closed = false;
  void handlers.then((ready) => {
    if (closed) return;
    dispose = serveRpc(
      {
        post: (message) => port.postMessage(message),
        onMessage: (handler) => port.on("message", (portEvent) => handler(portEvent.data)),
        onClose: (handler) => port.on("close", handler),
        close: () => port.close(),
      },
      ready,
    );
    port.start();
  });
  return () => {
    closed = true;
    dispose?.();
  };
});

// The database key and the keychain-backed SecretStore come from main; the composition root (M2-02) consumes them.
acceptStart(process.parentPort, () => undefined);
