import type { Result } from "../result.ts";

export type AsyncResult<T, E> = Promise<Result<T, E>>;

/** Stops a subscription or a schedule. Safe to call twice. */
export type Unsubscribe = () => void;

export interface Page<T> {
  readonly items: readonly T[];
  /** Opaque; `null` when there is nothing more. */
  readonly nextCursor: string | null;
}

export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

/**
 * Structural stand-in for `AbortSignal`: core's TypeScript lib has no DOM or Node globals, and a
 * real `AbortSignal` satisfies this shape, so callers pass one unchanged.
 */
export interface CancelSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}
