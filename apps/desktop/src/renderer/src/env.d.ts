/// <reference types="vite/client" />

interface Window {
  /** The preload's whole surface (src/preload/preload.ts). */
  pochimail: {
    requestWorkerPort: () => void;
    openMailAppLink: (link: string) => Promise<void>;
    showInFinder: (path: string) => Promise<void>;
    chooseFolder: () => Promise<string | null>;
  };
}

/** Replaced at build time (src/shared/gallery-build.ts): true only in dev and E2E builds. */
declare const __POCHIMAIL_GALLERY__: boolean;
