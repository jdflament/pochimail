/** Catalog authoring helper: the tuple keeps `{placeholders}` typed (code: `{name, plural, ...}`). */
export const entry = <const Params extends readonly string[]>(text: string, params: Params) => ({
  text,
  params,
});
