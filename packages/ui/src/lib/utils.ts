import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The design scale in styles/theme.css. Without these names tailwind-merge reads `text-body` as a color and
// drops a sibling `text-muted-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "overline",
            "caption",
            "ui",
            "body",
            "section",
            "title-sm",
            "title",
            "figure",
            "display",
          ],
        },
      ],
      "font-weight": [{ font: ["title"] }],
      tracking: [{ tracking: ["title", "overline"] }],
      rounded: [{ rounded: ["bar", "check"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
