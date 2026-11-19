import { ACTION_KINDS, type Command } from "@pochimail/core/domain/action";
import { CATEGORIES, type Category } from "@pochimail/core/domain/category";
import type { PolicyDenied } from "@pochimail/core/errors";
import { MessageId } from "@pochimail/core/ids";
import type { Authorization, AuthorizationContext } from "@pochimail/core/policies/authorize";
import {
  AUTONOMY_LEVELS,
  AUTOPILOT_CONFIDENCE_THRESHOLD,
  type AutonomyLevel,
} from "@pochimail/core/policies/autonomy";
import { WorkspaceId } from "@pochimail/kernel/ids";
import type { Result } from "@pochimail/kernel/result";
import { unwrap } from "@pochimail/kernel/result";
import { describe, expect, it } from "vitest";

type Authorize = (
  command: Command,
  ctx: AuthorizationContext,
) => Result<Authorization, PolicyDenied>;

const workspaceId = unwrap(WorkspaceId("w-1"));
const AUTOPILOT_KINDS: readonly string[] = ["archive", "unsubscribe"];
const CONFIDENCES = [
  0,
  0.5,
  AUTOPILOT_CONFIDENCE_THRESHOLD - 0.001,
  AUTOPILOT_CONFIDENCE_THRESHOLD,
  1,
];
const cmd = (kind: string): Command => ({
  kind: kind as Command["kind"], // "delete" is deliberately outside the type: a runtime-only probe
  messageIds: [unwrap(MessageId("m-1"))],
});
const ctx = (
  autonomy: AutonomyLevel,
  category: Category,
  confidence: number,
  userConfirmed: boolean,
): AuthorizationContext => ({
  workspaceId,
  autonomy,
  categories: [category],
  confidence,
  userConfirmed,
});

/** Contract for any `authorize` implementation: the safety matrix, table-driven. */
export function authorizeContract(authorize: Authorize): void {
  const allowed = (kind: string, c: AuthorizationContext) => authorize(cmd(kind), c).ok;

  describe("authorize contract", () => {
    it("never authorizes a delete under any policy, category, confidence or confirmation", () => {
      for (const a of AUTONOMY_LEVELS)
        for (const cat of CATEGORIES)
          for (const conf of CONFIDENCES)
            for (const confirmed of [true, false])
              expect(allowed("delete", ctx(a, cat, conf, confirmed))).toBe(false);
    });

    it("just-look never permits a mutation, even one the user confirmed", () => {
      for (const kind of ACTION_KINDS)
        for (const cat of CATEGORIES)
          for (const conf of CONFIDENCES)
            for (const confirmed of [true, false])
              expect(allowed(kind, ctx("just-look", cat, conf, confirmed))).toBe(false);
    });

    it("suggest never applies anything without explicit user confirmation", () => {
      for (const kind of ACTION_KINDS)
        for (const cat of CATEGORIES)
          for (const conf of CONFIDENCES) {
            expect(allowed(kind, ctx("suggest", cat, conf, false))).toBe(false);
            expect(allowed(kind, ctx("suggest", cat, conf, true))).toBe(true);
          }
    });

    it("autopilot never auto-actions People mail, however confident", () => {
      for (const kind of ACTION_KINDS)
        for (const conf of CONFIDENCES)
          expect(allowed(kind, ctx("autopilot", "people", conf, false))).toBe(false);
    });

    it("autopilot never auto-actions a batch that includes any People message", () => {
      const mixed = {
        ...ctx("autopilot", "promotions", 1, false),
        categories: ["promotions", "people"] as Category[],
      };
      expect(allowed("archive", mixed)).toBe(false);
      expect(authorize(cmd("archive"), mixed).ok).toBe(false);
      const unknown = authorize(cmd("archive"), { ...mixed, categories: [] });
      expect(!unknown.ok && unknown.error.reason).toBe("unknown-category");
    });

    it("autopilot applies eligible kinds only at or above the threshold, never below", () => {
      for (const cat of CATEGORIES.filter((c) => c !== "people"))
        for (const kind of AUTOPILOT_KINDS)
          for (const conf of CONFIDENCES)
            expect(allowed(kind, ctx("autopilot", cat, conf, false))).toBe(
              conf >= AUTOPILOT_CONFIDENCE_THRESHOLD,
            );
    });

    it("autopilot treats a NaN confidence as below threshold", () => {
      expect(allowed("archive", ctx("autopilot", "promotions", Number.NaN, false))).toBe(false);
    });

    it("autopilot does not auto-apply undo or bookkeeping kinds", () => {
      for (const kind of ACTION_KINDS.filter((k) => !AUTOPILOT_KINDS.includes(k)))
        expect(allowed(kind, ctx("autopilot", "promotions", 1, false))).toBe(false);
    });

    it("an explicitly confirmed action in autopilot is allowed, People included", () => {
      expect(allowed("archive", ctx("autopilot", "people", 0, true))).toBe(true);
    });
  });
}
