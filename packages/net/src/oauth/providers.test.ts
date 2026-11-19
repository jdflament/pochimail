import { MissingClientConfig } from "@pochimail/core/errors";
import { expect, it } from "vitest";
import {
  clientIdFrom,
  oauthProviderConfig,
  scopesFor,
  scopeTierFor,
  scopeUpgradeNeeded,
} from "./providers.ts";

it("just look asks for read scopes and suggest/autopilot for modify (guards asking for write access nobody chose)", () => {
  const google = oauthProviderConfig("google");
  const microsoft = oauthProviderConfig("microsoft");

  expect(scopeTierFor("just-look")).toBe("read");
  expect(scopeTierFor("suggest")).toBe("modify");
  expect(scopeTierFor("autopilot")).toBe("modify");

  expect(scopesFor(google, "just-look")).toContain(
    "https://www.googleapis.com/auth/gmail.readonly",
  );
  expect(scopesFor(google, "just-look")).not.toContain(
    "https://www.googleapis.com/auth/gmail.modify",
  );
  expect(scopesFor(google, "autopilot")).toContain("https://www.googleapis.com/auth/gmail.modify");
  expect(scopesFor(microsoft, "suggest")).toContain("Mail.ReadWrite");
  expect(scopesFor(microsoft, "just-look")).toContain("Mail.Read");
});

it("raising autonomy from just look to suggest asks for a new consent (guards acting without the write scope)", () => {
  const google = oauthProviderConfig("google");
  const grantedForRead = scopesFor(google, "just-look");
  expect(scopeUpgradeNeeded(google, grantedForRead, "just-look")).toBe(false);
  expect(scopeUpgradeNeeded(google, grantedForRead, "suggest")).toBe(true);
  expect(scopeUpgradeNeeded(google, scopesFor(google, "suggest"), "autopilot")).toBe(false);

  const microsoft = oauthProviderConfig("microsoft");
  expect(scopeUpgradeNeeded(microsoft, scopesFor(microsoft, "just-look"), "autopilot")).toBe(true);
});

it("no tier ever asks for send, delete or full-mailbox scopes (guards a scope creep into the consent screen)", () => {
  const forbidden = [
    "gmail.send",
    "https://mail.google.com/",
    "Mail.Send",
    "mail-w",
    "https://outlook.office.com/IMAP.AccessAsUser.All",
  ];
  for (const id of ["google", "microsoft"] as const) {
    for (const autonomy of ["just-look", "suggest", "autopilot"] as const) {
      for (const scope of scopesFor(oauthProviderConfig(id), autonomy)) {
        expect(forbidden).not.toContain(scope);
      }
    }
  }
});

it("a missing client id is a typed error naming the provider (guards a hard-coded client id or a crash)", () => {
  const missing = clientIdFrom(oauthProviderConfig("microsoft"), {});
  expect(missing.ok).toBe(false);
  if (!missing.ok) {
    expect(missing.error).toBeInstanceOf(MissingClientConfig);
    expect(missing.error.provider).toBe("microsoft");
  }
  const blank = clientIdFrom(oauthProviderConfig("google"), { POCHIMAIL_GOOGLE_CLIENT_ID: "  " });
  expect(blank.ok).toBe(false);

  const configured = clientIdFrom(oauthProviderConfig("google"), {
    POCHIMAIL_GOOGLE_CLIENT_ID: " fork-client-id ",
  });
  expect(configured).toEqual({ ok: true, value: "fork-client-id" });
});
