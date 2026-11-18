import type { Category } from "../domain/category.ts";
import type { IncomingMessage } from "../domain/mail.ts";
import type { AiUnavailable, Cancelled } from "../errors.ts";
import type { MessageId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "./common.ts";

export type AiError = AiUnavailable | Cancelled;

export interface Classification {
  readonly messageId: MessageId;
  readonly category: Category;
  readonly confidence: number;
  readonly reasons: readonly string[];
  /** Rules or model version that decided; recorded with the decision. */
  readonly modelVersion?: string;
  readonly templateHash?: string;
  readonly embeddingRef?: string;
}

export interface Classifier {
  classify(
    messages: readonly IncomingMessage[],
    signal: CancelSignal,
  ): AsyncResult<readonly Classification[], AiError>;
}

export interface Embedder {
  readonly dimensions: number;
  embed(
    texts: readonly string[],
    signal: CancelSignal,
  ): AsyncResult<readonly Float32Array[], AiError>;
}

export interface LlmRequest {
  readonly system?: string;
  readonly prompt: string;
  readonly maxTokens?: number;
}

/** Local model only. Output is untrusted text: callers validate it with zod. */
export interface LlmProvider {
  complete(request: LlmRequest, signal: CancelSignal): AsyncResult<string, AiError>;
}
