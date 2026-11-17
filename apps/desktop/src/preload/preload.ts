import { contextBridge, ipcRenderer } from "electron";

/**
 * Narrow bridge (ADR 0002). Main sends one MessagePort connected to the worker; the page asks for it and the preload
 * forwards it with `window.postMessage`, so the page then talks to the worker directly. The page never gets `ipcRenderer`.
 */
let port: MessagePort | undefined;
let requested = false;

const deliver = (): void => {
  if (port === undefined || !requested) return;
  window.postMessage("pochimail:worker-port", "*", [port]);
  port = undefined;
};

ipcRenderer.once("worker-port", (event) => {
  port = event.ports[0];
  deliver();
});

contextBridge.exposeInMainWorld("pochimail", {
  requestWorkerPort: (): void => {
    requested = true;
    deliver();
  },
});
