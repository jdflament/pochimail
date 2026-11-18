import { platformContract } from "@pochimail/testing/platform-contract";
import { createPlatformAdapter } from "./platform.ts";

platformContract(() => createPlatformAdapter("darwin", "/fake/pochimail-data"));
