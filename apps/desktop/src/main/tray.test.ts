import { EventEmitter } from "node:events";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAppTray, trayImageFile } from "./tray.ts";

/** The expected path, built the way the code builds it, so the test holds on Windows too. */
const imageAt = (file: string) => join("/res/tray", file);

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
  // Guards: a black glyph on a dark panel (or white on a light one), or an icon that keeps its old colour after the system theme changes. The supplied tray-light files hold the white glyph, tray-dark the black one.
  it.each([
    ["win32", "tray-light.ico", "tray-dark.ico"],
    ["linux", "tray-light.png", "tray-dark.png"],
  ] as const)(
    "on %s a dark theme uses the white-glyph image and a light theme the black-glyph one",
    (platform, whiteGlyph, blackGlyph) => {
      const { theme, images } = setup(platform, true);
      expect(images).toEqual([imageAt(whiteGlyph)]);
      theme.shouldUseDarkColors = false;
      theme.emit("updated");
      expect(images).toEqual([imageAt(whiteGlyph), imageAt(blackGlyph)]);
    },
  );

  // Guards: swapping the macOS template for a coloured image, which the menu bar would not tint.
  it("keeps the template image on macOS whatever the theme", () => {
    const { theme, images } = setup("darwin", true);
    theme.shouldUseDarkColors = false;
    theme.emit("updated");
    expect(images).toEqual([imageAt("trayTemplate.png")]);
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
