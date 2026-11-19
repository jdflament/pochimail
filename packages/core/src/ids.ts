import { type Brand, makeId } from "@pochimail/kernel/ids";

export type AccountId = Brand<string, "AccountId">;
export type MessageId = Brand<string, "MessageId">;
export type ThreadId = Brand<string, "ThreadId">;
export type ActionId = Brand<string, "ActionId">;
export type SuggestionId = Brand<string, "SuggestionId">;
export type AttachmentId = Brand<string, "AttachmentId">;
export type TopicId = Brand<string, "TopicId">;
export type ActionLogId = Brand<string, "ActionLogId">;

export const AccountId = makeId<AccountId>("AccountId");
export const MessageId = makeId<MessageId>("MessageId");
export const ThreadId = makeId<ThreadId>("ThreadId");
export const ActionId = makeId<ActionId>("ActionId");
export const SuggestionId = makeId<SuggestionId>("SuggestionId");
export const AttachmentId = makeId<AttachmentId>("AttachmentId");
export const TopicId = makeId<TopicId>("TopicId");
export const ActionLogId = makeId<ActionLogId>("ActionLogId");
