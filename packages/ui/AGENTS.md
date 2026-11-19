# UI rules
- Match `docs/design/screens/` at the same viewport (html/ has exact CSS). Attach the screenshot pair to the PR. Never invent a layout: open a design issue.
- Composition over configuration: no boolean or mode props that change what a component is. Declare only APIs you honour (`asChild` only with one child). Render lists from data.
- Wrap shadcn primitives, never fork them. `data-slot`, CVA variants, `cn()`, `focus-visible`.
- Tokens and the named scale only: no `[..px]`, no color literals, named breakpoints.
- Copy only through the i18n catalog (en, fr, ja). Never hard-code "Mac": use `deviceName()`.
- Accessible: real controls, keyboard reachable, visible focus, contrast ≥ 4.5:1.
- Components render from props only.
