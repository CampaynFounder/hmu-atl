# UI COMPONENTS — 21st.dev Registry & Design System

> **Part of HMU ATL documentation suite.** See [CLAUDE.md](../CLAUDE.md) for core project context.

---

## 21ST.DEV REGISTRY

21st.dev is an open-source shadcn/ui-based component registry. Components are installed with:

```bash
npx shadcn@latest add "https://21st.dev/r/[author]/[component]"
```

### Required Components (Install During Shared Components Agent Build)

```bash
npx shadcn@latest add "https://21st.dev/r/shadcn/card"
npx shadcn@latest add "https://21st.dev/r/shadcn/avatar"
npx shadcn@latest add "https://21st.dev/r/shadcn/badge"
npx shadcn@latest add "https://21st.dev/r/shadcn/button"
npx shadcn@latest add "https://21st.dev/r/shadcn/progress"
npx shadcn@latest add "https://21st.dev/r/shadcn/alert"
npx shadcn@latest add "https://21st.dev/r/shadcn/drawer"
npx shadcn@latest add "https://21st.dev/r/shadcn/sheet"
npx shadcn@latest add "https://21st.dev/r/shadcn/skeleton"
npx shadcn@latest add "https://21st.dev/r/shadcn/sonner"
npx shadcn@latest add "https://21st.dev/r/shadcn/tabs"
npx shadcn@latest add "https://21st.dev/r/shadcn/separator"
```

### Component Locations
All 21st.dev components install to:
```
/components/ui/
  ├── card.tsx
  ├── avatar.tsx
  ├── badge.tsx
  └── ...
```

---

## UI PHILOSOPHY

### Core Principles

1. **Mobile-first always**
   - Design for 390px width first, scale up
   - Touch targets minimum 44×44px
   - Thumb-zone optimization (bottom 60% of screen)

2. **Dark-mode ready**
   - Use CSS variables, never hardcode colors
   - All components support `dark:` variants
   - System preference detection on first load

3. **Atlanta aesthetic**
   - Dark backgrounds (`bg-zinc-950`, `bg-black`)
   - Vibrant accent colors (`text-cyan-400`, `bg-purple-500`)
   - Bold typography (Inter for UI, Space Grotesk for headings)

4. **NO vibe-coded UI**
   - Every component must be intentional, accessible, premium
   - Avoid gratuitous animations
   - Clear information hierarchy

5. **Feed paradigm**
   - The HMU broadcast feed is the core UI
   - Treat it like a social app, not a booking form
   - Infinite scroll, pull-to-refresh, real-time updates

---

## DESIGN TOKENS

### Colors (Tailwind CSS Variables)

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 189 100% 50%;       /* Cyan accent */
  --secondary: 280 100% 70%;     /* Purple accent */
  --muted: 240 4.8% 95.9%;
  --destructive: 0 84.2% 60.2%;
  --border: 240 5.9% 90%;
  --radius: 0.5rem;
}

.dark {
  --background: 0 0% 3.9%;       /* Almost black */
  --foreground: 0 0% 98%;
  --primary: 189 100% 50%;
  --secondary: 280 100% 70%;
  --muted: 240 3.7% 15.9%;
  --destructive: 0 62.8% 30.6%;
  --border: 240 3.7% 15.9%;
}
```

### Typography

```css
--font-sans: 'Inter', system-ui, sans-serif;
--font-heading: 'Space Grotesk', sans-serif;
```

**Scale**:
- xs: 0.75rem (12px)
- sm: 0.875rem (14px)
- base: 1rem (16px)
- lg: 1.125rem (18px)
- xl: 1.25rem (20px)
- 2xl: 1.5rem (24px)
- 3xl: 1.875rem (30px)
- 4xl: 2.25rem (36px)

### Spacing

Use Tailwind's default 4px scale:
- `gap-2` (8px), `gap-4` (16px), `gap-6` (24px)
- Consistent vertical rhythm: multiples of 8px

---

## CUSTOM COMPONENTS

### HMU Card (Driver/Rider Profile Card)
**File**: `components/hmu-card.tsx`

**Usage**:
```tsx
<HMUCard
  type="driver"
  displayName="Jay"
  areas={["Decatur", "East Atlanta"]}
  price={15}
  chillScore={92}
  tier="hmu_first"
  profilePhotoUrl="/avatars/jay.jpg"
  onClick={() => {}}
/>
```

**Features**:
- 4:3 aspect ratio media container
- Gradient overlay on photo
- Badge for HMU First tier
- Chill score progress ring
- Mobile-optimized tap target

---

### Rating Widget
**File**: `components/rating-widget.tsx`

**Usage**:
```tsx
<RatingWidget
  onRate={(type) => submitRating(type)}
  disabled={!canRate}
/>
```

**Options**:
- CHILL ✅
- Cool AF 😎
- Kinda Creepy 👀
- WEIRDO 🚩

**Design**: Large touch-friendly buttons, stacked vertically on mobile

---

### Status Badge
**File**: `components/status-badge.tsx`

**Usage**:
```tsx
<StatusBadge status="otw" />
```

**Statuses**:
- `otw` → "OTW" (cyan)
- `here` → "HERE" (green)
- `active` → "Ride Active" (purple)
- `ended` → "Ended" (gray)

---

## ACCESSIBILITY REQUIREMENTS

### Minimum Standards
- All interactive elements must have ARIA labels
- Keyboard navigation support (tab order, focus states)
- Color contrast ratio ≥4.5:1 for body text, ≥3:1 for large text
- Touch targets ≥44×44px
- No text in images (use live text with fallback)

### Testing
- Run `npm run lint:a11y` before committing
- Manual screen reader test (VoiceOver on iOS)
- Keyboard-only navigation test

---

## ANIMATION GUIDELINES

### Use Sparingly
- Transitions: 150ms for micro-interactions, 300ms for page transitions
- Easing: `ease-out` for entrances, `ease-in` for exits
- Respect `prefers-reduced-motion` (disable all non-essential animations)

### Approved Animations
- Fade in/out for modals
- Slide up for drawers
- Spin for loading indicators
- Pulse for live status indicators

### Banned
- Gratuitous parallax
- Page load animations >500ms
- Hover effects on touch devices

---

## RESPONSIVE BREAKPOINTS

```css
/* Mobile-first approach */
sm: 640px   /* Large phones */
md: 768px   /* Tablets */
lg: 1024px  /* Laptops */
xl: 1280px  /* Desktops */
```

**Design priority**:
1. **Mobile (390px)**: Core experience, must be perfect
2. **Tablet (768px)**: Optimize layout, don't just scale
3. **Desktop (1280px+)**: Optional enhancement, not required for MVP

---

## CLOUDFLARE IMAGES INTEGRATION

### Transformations
Use the in-Worker pattern (see [CLAUDE.md](../CLAUDE.md) Cloudflare Images section).

**Example**:
```tsx
// Fetch transformed image server-side
const resp = await fetch(sourceUrl, {
  cf: { image: { width: 800, format: 'jpeg', quality: 85 } },
} as RequestInit);
```

**Use cases**:
- Profile photos: 400×400, quality 80
- Vehicle photos: 800×600, quality 85
- OG share cards: 1200×630, quality 90

---

## RELATED DOCS
- [CLAUDE.md](../CLAUDE.md) — Cloudflare Images pattern, tech stack
- [Agent Build Plan](./AGENT-BUILD-PLAN.md) — Shared Components Agent (04) owns this layer
