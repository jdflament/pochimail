const ACCENTED: Readonly<Record<string, string>> = {
  a: "ä",
  c: "ç",
  e: "ë",
  i: "ï",
  n: "ñ",
  o: "ö",
  u: "ü",
  y: "ÿ",
};

/**
 * Dev-only pseudo-locale: accented, ~2x longer than English. Stories render it in a 320px
 * container to catch copy that cannot survive French/Japanese expansion (design › Writing).
 */
export const pseudo = (text: string): string => {
  const accented = [...text]
    .map((char) => {
      const mapped = ACCENTED[char.toLowerCase()];
      if (mapped === undefined) return char;
      return char === char.toLowerCase() ? mapped : mapped.toUpperCase();
    })
    .join("");
  return `${accented} — ${accented}`;
};
