/** M4-18: the dev gallery is compiled out of production. Its renderer chunk is named after its page and holds the `/gallery` route path. */
type AsarNode = { files?: Record<string, AsarNode>; offset?: string; size?: number };

/**
 * Reads the packaged app's app.asar (header: two sizes, then the JSON file tree; file offsets are relative to the end of the header)
 * and returns what in `out/renderer` shows the gallery shipped: a gallery chunk file name or the route path in any bundled script.
 * Only `out/renderer` is inspected: the archive also carries `src/`, which legitimately contains the (inert) gallery sources.
 */
export const galleryLeaksIn = (asar: Uint8Array): string[] => {
  const buf = Buffer.from(asar);
  const headerSize = buf.readUInt32LE(4);
  const jsonLength = buf.readUInt32LE(12);
  const tree = JSON.parse(buf.subarray(16, 16 + jsonLength).toString("utf8")) as AsarNode;
  const dataStart = 8 + headerSize;
  const renderer = tree.files?.["out"]?.files?.["renderer"];
  const leaks: string[] = [];
  const walk = (node: AsarNode, path: string) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const full = `${path}/${name}`;
      if (child.files !== undefined) walk(child, full);
      else {
        if (name.includes("dev-gallery")) leaks.push(`${full} (gallery chunk)`);
        if (name.endsWith(".js") && child.offset !== undefined && child.size !== undefined) {
          const start = dataStart + Number(child.offset);
          if (buf.subarray(start, start + child.size).includes('"/gallery"'))
            leaks.push(`${full} (route path)`);
        }
      }
    }
  };
  if (renderer !== undefined) walk(renderer, "out/renderer");
  return leaks;
};
