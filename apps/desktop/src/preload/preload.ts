import { contextBridge, ipcRenderer } from "electron";
import {
  chosenFolderSchema,
  folderPathSchema,
  mailAppLinkSchema,
  osChannels,
} from "../shared/os-calls.ts";

/**
 * Narrow bridge (ADR 0002). Main sends one MessagePort connected to the worker; the page asks for it and the preload
 * forwards it with `window.postMessage`, so the page then talks to the worker directly. The page never gets
 * `ipcRenderer`, `electron` or Node: only these four methods, each validated before it leaves the page.
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

const api = {
  requestWorkerPort: (): void => {
    requested = true;
    deliver();
  },
  openMailAppLink: (link: string): Promise<void> =>
    ipcRenderer.invoke(osChannels.openMailAppLink, mailAppLinkSchema.parse(link)),
  showInFinder: (path: string): Promise<void> =>
    ipcRenderer.invoke(osChannels.showInFinder, folderPathSchema.parse(path)),
  chooseFolder: async (): Promise<string | null> =>
    chosenFolderSchema.parse(await ipcRenderer.invoke(osChannels.chooseFolder)),
};

contextBridge.exposeInMainWorld("pochimail", api);
