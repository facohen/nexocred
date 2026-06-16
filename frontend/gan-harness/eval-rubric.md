# NexoCred Design Eval Rubric

## Design Quality (weight: 0.35)
Does it look like a premium fintech product? Stripe, Linear, Raycast-tier polish.
- 9-10: Award-worthy. Someone would screenshot this.
- 7-8: Clearly above enterprise average. Intentional and cohesive.
- 5-6: Better than before but still generic in places.
- 1-4: Could be any SaaS dashboard template.

Key checks:
- Risk color tokens used as HERO color (header band, accent, or dominant element) — not just badges
- Numbers rendered in Geist Mono, labels in Inter — never mixed
- Spacing follows 4/8/12/16/24/32 rhythm (no arbitrary padding)
- Hover/focus states feel designed, not default

## Originality (weight: 0.30)
Does it break the "4 equal gray cards" template? Surprising but not gimmicky.
- 9-10: Layout or visual device I haven't seen in 100 other dashboards
- 7-8: Distinctive enough to remember. Not a Tailwind starter template.
- 5-6: Some differentiation but still recognizably generic
- 1-4: Copy-paste enterprise

Key checks:
- Asymmetric layout (not equal columns)
- At least one "hero element" that dominates the composition
- Timeline or list feels like a visual object, not a text dump
- KPI cards have directionality (arrow, bar, delta, or color intent on the value)

## Craft (weight: 0.25)
Attention to the small things that separate good from great.
- 9-10: Every detail considered — truncation, empty states, loading, dark mode
- 7-8: Most details right, a few rough edges
- 5-6: Works but unpolished
- 1-4: Obvious shortcuts

Key checks:
- Empty/loading states styled (not blank div or "Loading…" raw text)
- Long names truncate gracefully
- Dark mode tokens used (not hardcoded colors that break)
- Transitions on interactive elements (hover elevation, not snap)
- No hardcoded hex/rgb/Tailwind palette colors — only CSS var tokens

## Functionality (weight: 0.10)
Does it still wire up correctly? This is design mode — a stunning near-complete beats a functional ugly.
- 9-10: Compiles, hooks work, props unchanged
- 7-8: Minor issue but visually complete
- 5-6: Some wiring broken
- 1-4: Doesn't render

Key checks:
- Same props interface as original
- Same hooks called (useFicha360, useTimeline, useCrearInteraccion, etc.)
- No new npm packages
- TypeScript compiles

## Scoring Formula
weighted = (design * 0.35) + (originality * 0.30) + (craft * 0.25) + (functionality * 0.10)
Pass threshold: 7.5
