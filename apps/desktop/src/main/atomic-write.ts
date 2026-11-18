import { closeSync, fsyncSync, openSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Crash-safe replace: write a temp file, fsync it, rename over the target, then fsync the directory (not possible
 * on Windows). A crash leaves either the old file or the new one, never a torn one.
 */
export const writeFileAtomic = (path: string, data: string | Buffer, mode = 0o600): void => {
  const temp = `${path}.tmp`;
  const fd = openSync(temp, "w", mode);
  try {
    writeSync(fd, typeof data === "string" ? Buffer.from(data) : data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
  if (process.platform === "win32") return;
  const dir = openSync(dirname(path), "r");
  try {
    fsyncSync(dir);
  } finally {
    closeSync(dir);
  }
};
