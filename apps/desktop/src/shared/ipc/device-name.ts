import { DEVICE_NAMES, type DeviceName, type Platform } from "@pochimail/core/ports/platform";
import { z } from "zod";

/** Device-name RPC spoken between renderer and worker over the existing MessagePort (ADR 0002). */
const requestSchema = z.object({
  id: z.number().int().nonnegative(),
  type: z.literal("device-name-request"),
});
const responseSchema = z.object({
  id: z.number().int().nonnegative(),
  type: z.literal("device-name-response"),
  name: z.enum(DEVICE_NAMES),
});

const DEVICE_BY_OS: Readonly<Record<string, DeviceName>> = {
  darwin: "Mac",
  macos: "Mac",
  win32: "PC",
  windows: "PC",
};

/** Unknown, empty or non-string OS input yields the neutral name, never "undefined". */
export const deviceNameFromOS = (os: unknown): DeviceName =>
  typeof os === "string" ? (DEVICE_BY_OS[os.toLowerCase()] ?? "computer") : "computer";

/** The smallest surface the RPC needs from a MessagePort, so DOM and worker ports both work. */
export type Transport = {
  post: (message: unknown) => void;
  onMessage: (handler: (data: unknown) => void) => void;
};

/** Worker side: answers valid requests from the Platform port and drops anything else. */
export const serveDeviceName = (
  transport: Transport,
  platform: Pick<Platform, "deviceName">,
): void => {
  transport.onMessage((data) => {
    const request = requestSchema.safeParse(data);
    if (!request.success) return;
    const response = {
      id: request.data.id,
      type: "device-name-response",
      name: platform.deviceName(),
    } as const;
    transport.post(response);
  });
};

/** Renderer side: correlates replies by id and rejects when the worker stays silent. */
export const createDeviceNameClient = (transport: Transport, timeoutMs = 5000) => {
  let nextId = 0;
  const pending = new Map<number, (name: DeviceName) => void>();

  transport.onMessage((data) => {
    const response = responseSchema.safeParse(data);
    if (!response.success) return;
    pending.get(response.data.id)?.(response.data.name);
    pending.delete(response.data.id);
  });

  return {
    deviceName: (): Promise<DeviceName> =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("worker did not answer"));
        }, timeoutMs);
        pending.set(id, (name) => {
          clearTimeout(timer);
          resolve(name);
        });
        transport.post({ id, type: "device-name-request" });
      }),
  };
};
