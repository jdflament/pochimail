import { createLogger } from "@pochimail/core/logger";
import { loggerContract } from "@pochimail/testing/logger-contract";

loggerContract("createLogger", (sink) => createLogger({ sink }));
