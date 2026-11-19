import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createAppTray, trayImageFile } from "./tray.ts";

const setup = (platform: NodeJS.Platform, dark: boolean) => {
  const theme = Object.assign(new EventEmitter(), { shouldUseDarkColors: dark });
  const images: string[] = [];
  const tray = {
    setImage: vi.fn((image: unknown) => images.push(image as string)),
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    destroy: vi.fn(),
  };
  const handle = createAppTray({
    platform,
    imagesDir: "/res/tray",
    theme,
    createTray: (image) => {
      images.push(image as unknown as string);
      return tray;
    },
    imageFromPath: (path) => path as never,
    buildMenu: (items) => items as never,
    labels: { tooltip: "Pochimail", open: "Open", quit: "Quit" },
    openApp: vi.fn(),
    quit: vi.fn(),
  });
  return { theme, images, tray, handle };
};

describe("tray image", () => {
  // Guards: a Windows or Linux tray icon that stays dark on a dark panel (or light on a light one) after the system theme changes.
  it.each([
    ["win32", "tray-dark.ico", "tray-light.ico"],
    ["linux", "tray-dark.png", "tray-light.png"],
  ] as const)(
    "follows the system theme on %s and updates when it changes",
    (platform, dark, light) => {
      const { theme, images } = setup(platform, true);
      expect(images).toEqual([`/res/tray/${dark}`]);
      theme.shouldUseDarkColors = false;
      theme.emit("updated");
      expect(images).toEqual([`/res/tray/${dark}`, `/res/tray/${light}`]);
    },
  );

  // Guards: swapping the macOS template for a coloured image, which the menu bar would not tint.
  it("keeps the template image on macOS whatever the theme", () => {
    const { theme, images } = setup("darwin", true);
    theme.shouldUseDarkColors = false;
    theme.emit("updated");
    expect(images).toEqual(["/res/tray/trayTemplate.png"]);
    expect(trayImageFile("darwin", false)).toBe("trayTemplate.png");
  });

  // Guards: a leaked theme listener or tray after the app removes it.
  it("removes the listener and the tray on dispose", () => {
    const { theme, tray, handle } = setup("linux", false);
    handle.dispose();
    expect(tray.destroy).toHaveBeenCalledOnce();
    expect(theme.listenerCount("updated")).toBe(0);
  });

  // Guards: a menu without the two items the app needs (open, quit).
  it("offers open and quit", () => {
    const { tray } = setup("linux", false);
    const items = tray.setContextMenu.mock.calls[0]?.[0] as { label: string }[];
    expect(items.map((i) => i.label)).toEqual(["Open", "Quit"]);
  });
});
