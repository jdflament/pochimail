import type { WorkspaceId } from "./ids.ts";

/**
 * The envelope every event carries; each domain's typed events refine it.
 * Events carry IDs and enums only, never subjects, addresses or bodies.
 * `id` lets handlers be idempotent under at-least-once delivery.
 */
export interface EventEnvelope {
  readonly id: string;
  readonly type: string;
  readonly workspaceId: WorkspaceId;
}
