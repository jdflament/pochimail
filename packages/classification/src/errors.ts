import { DomainError } from "@pochimail/kernel/errors";

/** The local model is missing, still loading or crashed. */
export class AiUnavailable extends DomainError {
  constructor(message = "Local AI is unavailable") {
    super("ai.unavailable", message);
  }
}
