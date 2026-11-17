import { serveEcho } from "../shared/ipc/echo.ts";
import { acceptPorts } from "./ports.ts";

// Runs inside Electron's utilityProcess. The composition root (core + adapters) will live here; for now it only echoes.
acceptPorts(process.parentPort, (port) => {
  serveEcho({
    post: (message) => port.postMessage(message),
    onMessage: (handler) => port.on("message", (portEvent) => handler(portEvent.data)),
  });
  port.start();
});
