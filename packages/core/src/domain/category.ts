import { z } from "zod";
import { confidenceSchema, reasonsSchema } from "./common.ts";

/** The 7 fixed categories (brief §3). Every message has exactly one. */
export const CATEGORIES = [
  "people",
  "records",
  "purchases-travel",
  "sign-ins-security",
  "notifications",
  "newsletters",
  "promotions",
] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

/** Phishing is a flag on top of any category, never a category (brief §3). */
export const suspiciousFlagSchema = z.object({
  reasons: reasonsSchema,
  confidence: confidenceSchema,
});
export type SuspiciousFlag = z.infer<typeof suspiciousFlagSchema>;

export const SIGNAL_KINDS = [
  "needs-reply",
  "waiting-on-them",
  "important-sender",
  "has-document",
  "time-sensitive",
  "old-never-opened",
] as const;
export const signalKindSchema = z.enum(SIGNAL_KINDS);
export type SignalKind = z.infer<typeof signalKindSchema>;
