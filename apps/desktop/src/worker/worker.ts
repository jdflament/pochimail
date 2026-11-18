import { serveDeviceName } from "../shared/ipc/device-name.ts";
import { serveEcho, type Transport } from "../shared/ipc/echo.ts";
import { createPlatformAdapter } from "../shared/platform.ts";
import { acceptPorts } from "./ports.ts";
import { acceptStart } from "./start.ts";

// Runs inside Electron's utilityProcess. The composition root (core + adapters) will live here; for now it echoes.
const platform = createPlatformAdapter(process.platform, process.cwd());

acceptPorts(process.parentPort, (port) => {
  const transport: Transport = {
    post: (message) => port.postMessage(message),
    onMessage: (handler) => port.on("message", (portEvent) => handler(portEvent.data)),
  };
  serveEcho(transport);
  serveDeviceName(transport, platform);
  port.start();
});

// The database key and the keychain-backed SecretStore come from main; the composition root (M2-02) consumes them.
acceptStart(process.parentPort, () => undefined);
