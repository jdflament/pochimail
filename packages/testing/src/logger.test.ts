import { createLogger } from "@pochimail/logger/logger";
import { loggerContract } from "@pochimail/testing/logger-contract";

loggerContract("createLogger", (sink) => createLogger({ sink }));
