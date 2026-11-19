export interface Page<T> {
  readonly items: readonly T[];
  /** Opaque; `null` when there is nothing more. */
  readonly nextCursor: string | null;
}

export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string;
}
