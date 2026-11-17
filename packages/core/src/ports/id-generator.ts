import type { ID_PREFIXES } from "../ids.ts";

export type IdPrefix = (typeof ID_PREFIXES)[number];

/** Source of new identifiers (`<prefix>_<ULID>`). Core never generates randomness itself. */
export interface IdGenerator {
  next(prefix: IdPrefix): string;
}
