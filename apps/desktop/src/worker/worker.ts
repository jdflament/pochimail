import { serveRpc } from "../shared/ipc/server.ts";
import { createPlatformAdapter } from "../shared/platform.ts";
import { acceptPorts } from "./ports.ts";
import { acceptStart } from "./start.ts";

// Runs inside Electron's utilityProcess. The composition root (core + adapters) will live here; M4-02 wires real handlers.
// Until then `app.state` and `device.name` answer; every other procedure returns a typed NOT_IMPLEMENTED error.
const platform = createPlatformAdapter(process.platform, process.cwd());

acceptPorts(process.parentPort, (port) => {
  const dispose = serveRpc(
    {
      post: (message) => port.postMessage(message),
      onMessage: (handler) => port.on("message", (portEvent) => handler(portEvent.data)),
      onClose: (handler) => port.on("close", handler),
      close: () => port.close(),
    },
    {
      procedures: {
        "app.state": () => ({ status: "ready", hasConnectedAccount: false }),
        "device.name": () => platform.deviceName(),
        "accounts.list": () => [],
        "overview.get": () => ({ scanned: 0, toReview: 0 }),
        "digest.get": () => ({ ready: false, itemCount: 0 }),
        "settings.get": () => ({ autopilot: false, notifications: true }),
      },
      subscriptions: {
        "app.events": () => undefined,
        "scan.progress": () => undefined,
      },
    },
  );
  port.start();
  return dispose;
});

// The database key and the keychain-backed SecretStore come from main; the composition root (M2-02) consumes them.
acceptStart(process.parentPort, () => undefined);
