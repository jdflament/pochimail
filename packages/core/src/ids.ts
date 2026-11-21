import { type Brand, makeId } from "@pochimail/kernel/ids";

export type ActionId = Brand<string, "ActionId">;
export type AttachmentId = Brand<string, "AttachmentId">;
export type ActionLogId = Brand<string, "ActionLogId">;

export const ActionId = makeId<ActionId>("ActionId");
export const AttachmentId = makeId<AttachmentId>("AttachmentId");
export const ActionLogId = makeId<ActionLogId>("ActionLogId");
