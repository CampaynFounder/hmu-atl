# HMU ATL — Brand Guidelines

> Pulled from the live codebase (`app/page.module.css`, `app/layout.tsx`, `app/globals.css`, `components/layout/header.tsx`). Use these tokens for marketing decks, social ads, print, partner materials — anything outside the app.
>
> **Source of truth in code**: `app/page.module.css` (visual tokens) + `app/layout.tsx` (fonts).

---

## 1. Brand essence

| Trait | Expression |
|---|---|
| Voice | Young, Atlanta-rooted, conversational, unapologetic |
| Posture | Pro-driver, anti-scammer, pro-community |
| Mood | Late-night neon, dark backgrounds, glowing accents |
| Vocabulary | HMU, BET, OTW, COO, CHILL, Cool AF, WEIRDO |
| Cadence | Short. Punchy. Often ALL-CAPS for emphasis. |

**Wordmark**: `HMU` + market suffix (`ATL`, `NOLA`). Always set in Bebas Neue, neon-green (`#00E676`) on dark surfaces. No standalone logo file exists — the wordmark *is* the logo.

---

## 2. Color system

### Core palette (dark mode = default)

| Token | Hex / RGBA | Use |
|---|---|---|
| **HMU Green** | `#00E676` | Primary brand color. Wordmark, primary CTAs, key accents, success/active states |
| HMU Green — Dim | `rgba(0, 230, 118, 0.12)` | Tinted backgrounds for green elements (badge fills, hover states) |
| HMU Green — Glow | `rgba(0, 230, 118, 0.25)` | Drop-shadows / outer glow on hover |
| Amber | `#FFB300` | Secondary accent (driver-side step icons, status indicators) |
| Amber — Dim | `rgba(255, 179, 0, 0.08)` | Tinted backgrounds for amber elements |
| Alert Red | `#FF4444` | Disputes, warnings, destructive actions |

### Surfaces (dark)

| Token | Hex | Use |
|---|---|---|
| Black | `#080808` | Primary page background |
| Off-black | `#0F0F0F` | Alternating sections |
| Card | `#141414` | Default card surface |
| Card 2 | `#1A1A1A` | Secondary card surface |
| Card 3 | `#1F1F1F` | Tertiary card / inset surface |
| Border subtle | `rgba(255, 255, 255, 0.08)` | Default 1px borders |
| Border bright | `rgba(255, 255, 255, 0.15)` | Emphasized borders |

### Type colors (dark)

| Token | Hex | Use |
|---|---|---|
| Text primary | `#FFFFFF` | Headlines, body |
| Text dim | `#BBBBBB` | Secondary copy |
| Text muted | `#888888` | Captions, metadata |

### Light mode (admin / print fallback)

| Token | Hex |
|---|---|
| Background | `#F5F5F5` |
| Background alt | `#EAEAEA` |
| Card | `#FFFFFF` |
| Text primary | `#111111` |
| Text dim | `#444444` |
| Text muted | `#666666` |
| Admin accent | `#2563EB` (light) / `#448AFF` (dark) — admin-only, not for marketing |

### Marketing gradients

For landing/social materials only — never inside the product chrome.

| Gradient | Stops | Where |
|---|---|---|
| Sunrise | `#F97316` → `#EA580C` → `#D97706` (orange-500 → orange-600 → amber-600) | Hero backdrops on landing pages |
| Sunset CTA | `#F97316` → `#D97706` (orange-500 → amber-600) | Marketing primary buttons |
| Rider Pop | `#A855F7` → `#EC4899` (purple-500 → pink-500) | Rider-side compose / interaction CTAs |
| Hero radial | `radial-gradient(circle, rgba(0,230,118,0.06) 0%, transparent 70%)` | Behind hero headlines on dark |

### Color usage rules

- HMU Green is for **driver / earning / premium / success** signals. Never use it for warnings.
- Alert Red is reserved for safety + disputes. Don't use it for low-priority warnings.
- Orange/amber gradients live in **acquisition surfaces** (landing pages, ads). Inside the app, prefer the green/dark system.
- Purple/pink is **rider-only** interaction color. Don't pair with green CTAs in the same view.
- Always pair green with the deep-black (`#080808`) background — never on a white surface in marketing.

---

## 3. Typography

All four families load via `next/font/google` in `app/layout.tsx`. For external materials, install the same Google Fonts.

| Role | Family | Weights used | CSS var |
|---|---|---|---|
| **Display** (headlines, wordmark) | Bebas Neue | 400 | `--font-display` |
| **Body** (paragraphs, buttons) | DM Sans | 400 / 500 / 600 / 700 | `--font-body` |
| **Mono** (stats, prices, codes) | Space Mono | 400 / 700 | `--font-mono` |
| Fallback sans | Inter | 400 | `--font-inter` |

### Type scale (mobile-first, 390px baseline)

| Level | Family | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|---|
| Hero (H1) | Bebas Neue | `clamp(56px, 14vw, 120px)` | 400 | 0.92 | 1px |
| Section (H2) | Bebas Neue | `clamp(40px, 10vw, 72px)` | 400 | 0.95 | normal |
| Column / sub (H3) | Bebas Neue | 32px | 400 | 1.0 | normal |
| Wordmark — large | Bebas Neue | 26px | 400 | 1.0 | 2px |
| Wordmark — header | Bebas Neue | 22px | 700 | 1.0 | 1px |
| Card title | DM Sans | 16px | 600 | 1.4 | normal |
| Body | DM Sans | 16px | 400 | 1.6 | normal |
| Caption | DM Sans | 13–14px | 500 | 1.4 | normal |
| Stat value | Space Mono | varies | 700 | 1.0 | normal |
| Badge / pill | DM Sans | 9–11px | 800 | 1.0 | 0.5px |

### Typography rules

- **Headlines are always Bebas Neue.** Never substitute a heavier sans for display.
- **Bebas Neue is uppercase by design.** Don't force `text-transform: lowercase` on it.
- **Body copy is DM Sans.** Don't set body in Bebas Neue (it's too tall and condensed).
- **Numerals in stats / prices** use Space Mono — keeps columns aligned and reads "data-y."
- Avoid italics. Brand has no italic variant in production.

---

## 4. Wordmark

```
HMU ATL    HMU NOLA
```

- Family: Bebas Neue 400
- Color: `#00E676` on dark; `#080808` on light surfaces (rare)
- Tracking: 1–2px (tighter at small sizes)
- Minimum size: 16px
- Clear space: at least 1× the cap-height around all sides

**Don't**: skew, recolor outside the palette, set in another font, add drop shadows other than the green glow, place on busy photos without a dark scrim.

---

## 5. Components & elevation

### Border-radius scale

| Token | Value | Use |
|---|---|---|
| Pill | `100px` | Buttons, badges, nav pills |
| Card | `20px` | Standard card containers |
| Card-lg | `24px` (Tailwind `rounded-3xl`) | Hero / modal cards |
| Card-md | `16px` | Step boxes, secondary cards |
| Tile | `12px` | Icon backgrounds, inputs |
| Chip | `8px` | Numbered badges, small chips |

### Shadows / glow

| Token | Value | Use |
|---|---|---|
| Glow — sm | `0 0 20px rgba(0,230,118,0.25)` | Subtle hover on links |
| Glow — md | `0 0 24px rgba(0,230,118,0.25)` | Outline button hover |
| Glow — lg | `0 0 32px rgba(0,230,118,0.25)` | Primary CTA hover |
| Card shadow | Tailwind `shadow-lg` | Standard card lift on light |
| Hero shadow | Tailwind `shadow-2xl` | Modal / hero card on light |

### Buttons

**Primary**
- Fill: `#00E676`
- Text: `#080808`, DM Sans 700, 16px
- Padding: `16px 36px`, radius `100px`
- Hover: `scale(1.03)` + `0 0 32px` green glow

**Outline**
- Fill: transparent
- Text: `#00E676`, DM Sans 700, 16px
- Border: `2px solid #00E676`, radius `100px`
- Hover: fill with green-dim, `scale(1.03)` + `0 0 24px` glow

**HMU First badge**
- Fill: `#00E676`, text `#080808`
- DM Sans 800, 9px, tracking `0.5px`, padding `3px 8px`, radius `100px`

---

## 6. Imagery & texture

- **Noise overlay**: a subtle SVG fractal-noise layer at `opacity: 0.4` (dark) / `0.15` (light) sits over every page. Replicate in print/social with a 3–5% grain to keep surfaces from looking flat.
- Photography: low-key, real Atlanta neighborhoods, drivers/riders in their actual cars. Avoid stock-y rideshare imagery (white SUVs, smiling strangers in suits).
- Avoid pure-white surfaces in marketing. Default to deep black (`#080808`) with green accents.

---

## 7. Voice & copy

### Vocab cheat sheet (use these exact strings in UI / ads)

| Concept | Display text |
|---|---|
| Driver goes live | **HMU** |
| Driver heading to rider | **OTW** |
| Driver arrived | **HERE** |
| Rider accepts + pays | **COO** |
| Rider heading to car | **BET** |
| Ride in progress | **Ride Active** |
| End ride | **End Ride** |
| Rider dispute | "Nah fam, that's not right" |
| Rating — good | **CHILL ✅** |
| Rating — great | **Cool AF 😎** |
| Rating — uncomfortable | **Kinda Creepy 👀** |
| Rating — safety | **WEIRDO 🚩** |

### Sample headlines

- "HATE Blank Trips?"
- "MAKE MORE DOING RIDES."
- "Make Bank Trips not Blank Trips."
- "Ride Scammers Hold the L."
- "Keep More $$$. Upfront Payments. No Blank Trips. No Goofy Ish."
- "Cash rides can be dangerous. HMU for safer rides, secure deposits, same-day pay."

### Voice rules

- Speak **with** the user, not at them. "You" beats "users."
- All-caps for emphasis is on-brand. Don't overuse — one all-caps line per screen.
- Emoji are allowed, sparingly: ✅ 😎 👀 🚩 🔥 — these four plus fire. Avoid emoji clusters.
- Don't mention timezones in user-facing strings (single-market voice).
- Never use corporate words: "users," "consumers," "leverage," "solution," "synergy."

### Anti-patterns

- ❌ "Welcome to our platform"
- ❌ "Our customers love..."
- ❌ "Click here to learn more"
- ✅ "HMU when you ready"
- ✅ "Drivers keep 88% of every ride"
- ✅ "Your money's locked in before they pull up"

---

## 8. Quick token export (for design tools)

```css
/* Brand tokens — paste into Figma variables, Webflow, etc. */
--hmu-green:        #00E676;
--hmu-green-dim:    rgba(0, 230, 118, 0.12);
--hmu-green-glow:   rgba(0, 230, 118, 0.25);
--hmu-amber:        #FFB300;
--hmu-red:          #FF4444;

--hmu-bg:           #080808;
--hmu-bg-alt:       #0F0F0F;
--hmu-card:         #141414;
--hmu-card-2:       #1A1A1A;
--hmu-card-3:       #1F1F1F;

--hmu-text:         #FFFFFF;
--hmu-text-dim:     #BBBBBB;
--hmu-text-muted:   #888888;

--hmu-border:        rgba(255,255,255,0.08);
--hmu-border-bright: rgba(255,255,255,0.15);

--font-display: 'Bebas Neue', sans-serif;
--font-body:    'DM Sans', sans-serif;
--font-mono:    'Space Mono', monospace;

--radius-pill:  100px;
--radius-card:  20px;
--radius-tile:  12px;
--radius-chip:  8px;

--glow-sm: 0 0 20px rgba(0,230,118,0.25);
--glow-md: 0 0 24px rgba(0,230,118,0.25);
--glow-lg: 0 0 32px rgba(0,230,118,0.25);
```
