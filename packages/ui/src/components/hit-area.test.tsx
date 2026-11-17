import { Checkbox } from "@pochimail/ui/components/checkbox";
import { RadioGroup, RadioGroupItem } from "@pochimail/ui/components/radio-group";
import { Switch } from "@pochimail/ui/components/switch";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

// Guards: brief §6 minimum 32px target; the 16-18px controls keep a 32x32 ::after hit area (no layout shift).
it.each([
  ["switch", <Switch key="s" />],
  ["checkbox", <Checkbox key="c" />],
  [
    "radio",
    <RadioGroup key="r">
      <RadioGroupItem value="a" />
    </RadioGroup>,
  ],
])("%s has a 32px hit area", (_name, node) => {
  const html = renderToStaticMarkup(node);
  for (const c of ["after:absolute", "after:h-8", "after:min-w-8", "after:w-full"])
    expect(html).toContain(c);
});
