import { join } from "node:path";
import type { Menu, NativeImage, Tray } from "electron";

/** The file a tray shows. macOS uses a template image, so the system tints it. Elsewhere the glyph must contrast with the panel: tray-light is the white glyph (for a dark panel), tray-dark the black glyph (for a light panel). */
export const trayImageFile = (platform: NodeJS.Platform, dark: boolean): string => {
  if (platform === "darwin") return "trayTemplate.png";
  return `tray-${dark ? "light" : "dark"}.${platform === "win32" ? "ico" : "png"}`;
};

type TrayLike = Pick<Tray, "setImage" | "setToolTip" | "setContextMenu" | "destroy">;

export type TrayDeps = {
  readonly platform: NodeJS.Platform;
  /** The folder holding the tray images. */
  readonly imagesDir: string;
  readonly theme: {
    readonly shouldUseDarkColors: boolean;
    on: (event: "updated", listener: () => void) => void;
    off: (event: "updated", listener: () => void) => void;
  };
  readonly createTray: (image: NativeImage) => TrayLike;
  readonly imageFromPath: (path: string, template: boolean) => NativeImage;
  readonly buildMenu: (items: readonly { label: string; click: () => void }[]) => Menu;
  readonly labels: { readonly tooltip: string; readonly open: string; readonly quit: string };
  readonly openApp: () => void;
  readonly quit: () => void;
};

/** The menu-bar or system-tray icon. It follows the system theme and has the two items the app needs for now. */
export const createAppTray = (deps: TrayDeps): { dispose: () => void } => {
  const image = () =>
    deps.imageFromPath(
      join(deps.imagesDir, trayImageFile(deps.platform, deps.theme.shouldUseDarkColors)),
      deps.platform === "darwin",
    );
  const tray = deps.createTray(image());
  tray.setToolTip(deps.labels.tooltip);
  tray.setContextMenu(
    deps.buildMenu([
      { label: deps.labels.open, click: deps.openApp },
      { label: deps.labels.quit, click: deps.quit },
    ]),
  );
  // macOS tints the template itself; the other systems need the other file when the theme flips.
  const onThemeChange = () => {
    if (deps.platform !== "darwin") tray.setImage(image());
  };
  deps.theme.on("updated", onThemeChange);
  return {
    dispose: () => {
      deps.theme.off("updated", onThemeChange);
      tray.destroy();
    },
  };
};
