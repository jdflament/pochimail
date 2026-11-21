import { createFakePlatform } from "../test-support/fake-platform.ts";
import { platformContract } from "../test-support/platform-contract.ts";
import { createPlatformAdapter } from "./platform.ts";

platformContract(() => createPlatformAdapter("darwin", "/fake/pochimail-data"));
platformContract(() => createFakePlatform({ os: "macos" }));
platformContract(() => createFakePlatform({ os: "windows" }));
platformContract(() => createFakePlatform({ os: "linux" }));
