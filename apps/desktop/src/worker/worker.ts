import { serveEcho } from "../shared/ipc/echo.ts";
import { acceptPorts } from "./ports.ts";
import { acceptStart } from "./start.ts";

// Runs inside Electron's utilityProcess. The composition root (core + adapters) will live here; for now it only echoes.
acceptPorts(process.parentPort, (port) => {
  serveEcho({
    post: (message) => port.postMessage(message),
    onMessage: (handler) => port.on("message", (portEvent) => handler(portEvent.data)),
  });
  port.start();
});

// The database key and the keychain-backed SecretStore come from main; the composition root (M2-02) consumes them.
acceptStart(process.parentPort, () => undefined);
