-- M2-05: the OAuth scopes the provider granted, so raising autonomy knows whether a new consent is
-- needed (scopeUpgradeNeeded). Metadata only (D11): scope strings, never a token.
ALTER TABLE account ADD COLUMN granted_scopes TEXT NOT NULL DEFAULT '[]';
