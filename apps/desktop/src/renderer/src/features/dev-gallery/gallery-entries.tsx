import { Mascot } from "@pochimail/ui/components/mascot";
import * as motionStories from "@pochimail/ui/components/motion.stories";
import { type ComponentType, createElement, type ReactElement } from "react";
import * as stateStories from "../states/required-states.stories.tsx";

export type GalleryEntry = { id: string; name: string; render: () => ReactElement };

type StoryModule = Record<string, unknown>;

// Entries are the stories themselves (no copies): every export except `default` and the `*Dark` twins, because the gallery has its own theme toggle.
const fromStories = (module: StoryModule): GalleryEntry[] =>
  Object.entries(module)
    .filter(([key]) => key !== "default" && !key.endsWith("Dark"))
    .flatMap(([key, story]) => {
      const render = (story as { render?: ComponentType }).render;
      return render === undefined
        ? []
        : [{ id: key, name: key, render: () => createElement(render) }];
    });

export const stateEntries: GalleryEntry[] = fromStories(stateStories);

// Pochi's two moments (docs/design.md › Motion catalog) have no dedicated story of their own, so they compose the same Mascot.
export const motionEntries: GalleryEntry[] = [
  ...fromStories(motionStories),
  { id: "PochiAtRest", name: "PochiAtRest", render: () => <Mascot alt="" /> },
  {
    id: "PochiFindsSomething",
    name: "PochiFindsSomething",
    render: () => <Mascot alt="" pose="reading" reaction="found" />,
  },
];
