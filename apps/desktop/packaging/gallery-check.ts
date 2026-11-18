/** M4-18: the dev gallery is compiled out of production. The renderer's gallery chunk is named after its page and holds the `/gallery` route path. */
const GALLERY_MARKERS = ["dev-gallery-page", '"/gallery"'] as const;

/** Returns the gallery markers found in the packaged app's asar (an uncompressed archive: file names and contents are plain bytes). */
export const galleryMarkersIn = (asar: Uint8Array): string[] => {
  const text = Buffer.from(asar).toString("latin1");
  return GALLERY_MARKERS.filter((marker) => text.includes(marker));
};
