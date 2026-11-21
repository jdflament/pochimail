import { type Brand, makeId } from "@pochimail/kernel/ids";

export type AttachmentId = Brand<string, "AttachmentId">;
export const AttachmentId = makeId<AttachmentId>("AttachmentId");
