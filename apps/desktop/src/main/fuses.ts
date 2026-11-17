import { type FuseConfig, FuseV1Options, FuseVersion } from "@electron/fuses";

/** Electron Fuses flipped on the packaged binary (ADR 0002). Applied by the packaging step (M0-10) through `flipFuses`. */
export const fuses = {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
} satisfies FuseConfig;
