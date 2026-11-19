-- Q-14/#123: the message size the provider reports, for "space you can free" (ADR 0012). A number only (D11).
ALTER TABLE message ADD COLUMN size INTEGER;
