# NexoCred — Full Frontend Redesign: Stripe-Grade Fintech

## Context

NexoCred is a fintech lending platform (préstamos personales, Argentina). React + Tailwind, strong token system. Currently: clean but personality-free enterprise gray. The goal is a Stripe-quality redesign — every major surface should feel intentional, premium, and built with craft.

## Token System (DO NOT CHANGE CSS — USE AS IS)

```css
/* Risk ordinal scale */
--risk-0-text, --risk-0-bg, --risk-0-border       /* green */
--risk-30-text, --risk-30-bg, --risk-30-border     /* yellow */
--risk-60-text, --risk-60-bg, --risk-60-border     /* orange */
--risk-90-text, --risk-90-bg, --risk-90-border     /* red */
--risk-castigo-text, --risk-castigo-bg             /* dark red */

/* Semantic */
--pos-text / --pos-bg / --pos-border
--warn-text / --warn-bg / --warn-border
--neg-text / --neg-bg / --neg-border
--info-text / --info-bg / --info-border

/* Brand */
--brand: hsl(245 58% 51%)   /* purple */
--brand-subtle, --brand-text, --brand-bg, --brand-border

/* Surface */
--surface / --surface-sunken / --surface-pop
--text / --text-muted / --text-subtle
--border / --border-strong
```

Typography: Inter Variable (body) + Geist Mono (numbers). Already loaded.

## Surfaces to Redesign

### 1. FichaCliente360 — Customer 360 card
**Current:** 4 flat number boxes + plain timeline list.
**Target:** 
- Header band colored by risk bucket (risk-0=green strip → risk-castigo=dark red)
- Typographic avatar (initials + geometric fill, no photos)
- Asymmetric layout: large exposure metric left (40%), compact KPI cluster right
- Timeline with vertical dot-line, color-coded dots by event type
- "Promesas vigentes" shown as mini progress bar (promised vs. owed)

### 2. BandejaHome — Inbox / Work queue
**Current:** Three flat sections (vencidas/hoy/próximas), identical card style.
**Target:**
- Overdue section visually dominates — darker surface, neg-border left accent strip, count badge
- Today section: standard but elevated, brand-border accent
- Upcoming: muted, secondary prominence
- Each task card: left priority color strip, persona name + type badge, action button inline

### 3. RiesgoBoard — Risk dashboard
**Current:** Flat metric cards, basic aging table.
**Target:**
- KPI cards with color-intent values (pos/neg/warn applied to the number itself)
- Aging bar chart as a visual stacked health strip, not just a table
- Concentration table with inline micro-bars for portfolio weight
- Zona/sector filter bar styled as pill-toggles, not plain selects

### 4. PersonasListPage — Client list
**Current:** Plain table, search bar.
**Target:**
- Search bar as prominent hero element at top
- Table rows with left risk-color dot, avatar initial, CUIL/DNI in mono
- Row hover: slight surface-pop elevation
- Empty/loading state with skeleton rows

### 5. InboxPage — CRM task inbox (tareas / incidentes / prospectos tabs)
**Current:** Tabs + list, generic.
**Target:**
- Tab bar as underline-active pill style
- Task cards: priority left strip, overdue indicator (neg-text date), type badge
- Incident cards: severity drives card border color

## Design Principles to Apply Throughout

1. **Color with purpose**: Every color token used must signal something — not decoration
2. **Numbers with context**: KPIs get a trend arrow or color intent. Raw numbers alone are not enough.
3. **Hierarchy through scale AND weight**: Headers use size contrast, not just bold
4. **Micro-spacing discipline**: 4/8/12/16/24/32px rhythm. No random padding.
5. **Stripe-style interactive states**: hover → subtle shadow lift + bg shift. Focus → brand ring.
6. **Typography as design**: Geist Mono for ALL numbers. Inter for all labels. Never mix.

## Non-Negotiables

- No new npm packages
- All existing props/hooks interfaces unchanged
- No hardcoded hex or rgb — only CSS var tokens
- Light AND dark mode must both look intentional (tokens handle this automatically)
- One component per iteration — Generator picks the highest-impact target each round
