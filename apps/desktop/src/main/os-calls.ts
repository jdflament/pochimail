import { isAbsolute, relative, resolve } from "node:path";
import {
  chosenFolderSchema,
  folderPathSchema,
  mailAppLinkSchema,
  osChannels,
} from "../shared/os-calls.ts";

type Sender = { senderFrame?: { url: string } | null };
export type OsCallDeps = {
  ipc: {
    handle: (channel: string, listener: (event: Sender, ...args: unknown[]) => unknown) => void;
  };
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (path: string) => void;
  chooseFolder: () => Promise<string | null>;
  isAppUrl: (url: string) => boolean;
  /** App-owned folders (e.g. userData) that may be revealed without the user having picked them. */
  appDataDirs: () => string[];
};

const isInside = (root: string, path: string): boolean => {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/**
 * The only `ipcMain` handlers in the app. They carry no mail data: renderer <-> worker traffic uses the MessagePort and
 * never reaches main. Calls from any frame that is not the app's own page are refused.
 */
export const registerOsCalls = (deps: OsCallDeps): void => {
  // showInFinder is not a general file-reveal: only folders the user picked, or the app's own data folders.
  const pickedFolders = new Set<string>();
  const guarded =
    <T>(run: (...args: unknown[]) => T) =>
    (event: Sender, ...args: unknown[]): T => {
      const url = event.senderFrame?.url;
      if (url === undefined || !deps.isAppUrl(url))
        throw new Error("os call refused: unknown sender");
      return run(...args);
    };

  deps.ipc.handle(
    osChannels.openMailAppLink,
    guarded((link) => deps.openExternal(mailAppLinkSchema.parse(link))),
  );
  deps.ipc.handle(
    osChannels.showInFinder,
    guarded((rawPath) => {
      const path = folderPathSchema.parse(rawPath);
      const allowed = [...pickedFolders, ...deps.appDataDirs()].some((root) =>
        isInside(root, path),
      );
      if (!allowed) throw new Error("os call refused: path was not chosen by the user");
      deps.showItemInFolder(path);
    }),
  );
  deps.ipc.handle(
    osChannels.chooseFolder,
    guarded(async () => {
      const folder = chosenFolderSchema.parse(await deps.chooseFolder());
      if (folder !== null) pickedFolders.add(folder);
      return folder;
    }),
  );
};
