import type { MailCommands, MailProviderError } from "@pochimail/actions/ports/mail-commands";
import type { MailReader } from "@pochimail/mailbox/ports/mail-reader";

/** A connected mailbox as the workflows see it: mail in for the mailbox, commands out for actions. */
export interface MailProvider extends MailReader<MailProviderError>, MailCommands {}
