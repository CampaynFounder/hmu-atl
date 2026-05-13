# BLAST BOOKING UX FIXES — Analysis & Action Plan

> Created: 2026-05-13
> Status: Ready for implementation
> Priority: P0 — blocks launch polish

---

## ISSUES IDENTIFIED

### 1. Text Field Behind Header (Name Step)
**Current**: Input field on "What should we call you?" step loads behind the sticky header
**File**: `app/rider/blast/new/blast-form-client.tsx:827-849`
**Root cause**: NameStep has `pt-8` but header is `sticky top-14`, creating overlap

### 2. Missing Loading Indicators
**Current**: Several async states show no visual feedback
**Locations**:
- Photo upload (has spinner, but error shows no retry UI)
- "Get My Ride" blast creation (button says "Blasting…" but no spinner)
- Driver search on offer board (has pulse dots, but needs richer animation)

### 3. Random Name Generation Missing
**Current**: No auto-fill for display name based on gender selection
**Requested**: If rider selects "woman" → suggest random name from list of 5, same for "man"

### 4. "Almost There" Header Typography
**Current**: Uses body font
**File**: `app/rider/blast/new/blast-form-client.tsx:902` (`PhotoStep`)
**Requested**: Use HMU display font (`--font-display`) for prominence

### 5. Photo Upload False Error
**Current**: "Load failed" error shows even though photo appears to have uploaded
**File**: `app/rider/blast/new/blast-form-client.tsx:886`
**Likely cause**: Race condition between preview URL display and server response

### 6. "Get My Ride Blasting" Animation Needs Enrichment
**Current**: Simple pulse dots with generic text
**File**: `app/rider/blast/[id]/blast-board-client.tsx:215-223`
**Requested**: Multi-stage animation showing:
  - Checking your preferences
  - Checking driver locations
  - Checking driver prices
  - If no drivers found → show criteria (price, location, etc.) + coach user to adjust

### 7. Address Hidden Behind Header (Offer Board)
**Current**: After "Get My Ride Blasting" page loads, address subtitle is hidden behind header
**File**: `app/rider/blast/[id]/blast-board-client.tsx:191-208`
**Root cause**: No top padding on header after countdown bar

### 8. Countdown Timer Not Prominent Enough
**Current**: Small gray text under price
**File**: `app/rider/blast/[id]/blast-board-client.tsx:203-207`
**Requested**: More prominent, possibly larger + color-coded

### 9. Real-Time Driver Loading Without Refresh
**Current**: Soft polling every 15 seconds + Ably updates trigger full refresh
**File**: `app/rider/blast/[id]/blast-board-client.tsx:63-80`
**Requested**: Drivers should appear in real-time via Ably with no visual refresh/reload

---

## RECOMMENDED NAME LISTS

### Women's Names (Randomly Selected on Gender "Woman")
1. Aaliyah
2. Destiny
3. Imani
4. Jasmine
5. Kennedy
6. Layla
7. Morgan
8. Naomi
9. Riley
10. Skylar

### Men's Names (Randomly Selected on Gender "Man")
1. Andre
2. Darius
3. Isaiah
4. Jamal
5. Jordan
6. Malik
7. Marcus
8. Terrence
9. Xavier
10. Zion

**Implementation**: Pick random name from appropriate list on gender selection, pre-fill input, allow edit

---

## ACTION PLAN

### P0 — Header Overlap Issues

**Fix 1: Name Step Header Clearance**
```tsx
// app/rider/blast/new/blast-form-client.tsx:827
// Change:
<div className="px-1 pt-8 pb-32">
// To:
<div className="px-1 pt-20 pb-32">
```
**Why**: `pt-20` (80px) provides clearance for 56px sticky header (top-14 = 56px) + breathing room

**Fix 2: Offer Board Header Padding**
```tsx
// app/rider/blast/[id]/blast-board-client.tsx:191
// Change:
<header className="px-4 py-4">
// To:
<header className="px-4 pt-6 pb-4">
```
**Why**: `pt-6` clears the 4px countdown bar + adds visual separation

---

### P0 — Random Name Generation

**New Helper** (add to `blast-form-client.tsx`):
```typescript
const WOMEN_NAMES = ['Aaliyah', 'Destiny', 'Imani', 'Jasmine', 'Kennedy', 'Layla', 'Morgan', 'Naomi', 'Riley', 'Skylar'];
const MEN_NAMES = ['Andre', 'Darius', 'Isaiah', 'Jamal', 'Jordan', 'Malik', 'Marcus', 'Terrence', 'Xavier', 'Zion'];

function getRandomName(gender: 'man' | 'woman' | 'other' | null): string {
  if (gender === 'woman') return WOMEN_NAMES[Math.floor(Math.random() * WOMEN_NAMES.length)];
  if (gender === 'man') return MEN_NAMES[Math.floor(Math.random() * MEN_NAMES.length)];
  return '';
}
```

**Integration** (in `continueAfterAuth` callback around line 217):
```typescript
// After checking hasDisplayName:
if (!body.hasDisplayName) {
  const suggestedName = getRandomName(draft.rider_gender);
  setDisplayName(suggestedName);
  setStep('name');
}
```

---

### P0 — "Almost There" Typography

**Fix**:
```tsx
// app/rider/blast/new/blast-form-client.tsx:901-902
// Change:
<p className="text-sm text-neutral-400 text-center mb-2">
  {displayName ? `Almost there, ${displayName}!` : 'Almost there!'}
</p>
// To:
<h2
  className="text-2xl text-white text-center mb-2"
  style={{ fontFamily: 'var(--font-display)' }}
>
  {displayName ? `Almost there, ${displayName}!` : 'Almost there!'}
</h2>
```

---

### P1 — Loading Indicators

**Fix 1: "Get My Ride" Button Spinner**
```tsx
// app/rider/blast/new/blast-form-client.tsx:1020-1023
// Replace CTAButton with inline spinner:
<CTAButton onClick={onSend} disabled={submitting}>
  {submitting && (
    <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />
  )}
  {submitting ? 'Blasting…' : 'Get My Ride'}
</CTAButton>
```

**Fix 2: Photo Upload Retry UI**
```tsx
// app/rider/blast/new/blast-form-client.tsx:936
// After error display, add:
{error && (
  <>
    <div className="text-center text-xs text-red-400 mb-3">{error}</div>
    <div className="text-center">
      <button
        onClick={() => { setError(null); inputRef.current?.click(); }}
        className="text-sm text-[#00E676] underline"
      >
        Try again
      </button>
    </div>
  </>
)}
```

---

### P1 — Driver Search Animation (Multi-Stage)

**New Component** (`blast-board-client.tsx`):
```tsx
function DriverSearchAnimation({ stage }: { stage: number }) {
  const stages = [
    { icon: '🔍', text: 'Checking your preferences…' },
    { icon: '📍', text: 'Finding drivers nearby…' },
    { icon: '💰', text: 'Comparing prices…' },
  ];
  const { icon, text } = stages[stage % stages.length];
  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 px-4 py-12 text-center">
      <div className="text-5xl animate-bounce mb-4">{icon}</div>
      <div className="text-base text-white font-medium mb-2">{text}</div>
      <div className="text-xs text-neutral-500">This usually takes 10-30 seconds</div>
    </div>
  );
}
```

**Integration** (replace static pulse dots around line 216):
```tsx
const [searchStage, setSearchStage] = useState(0);
useEffect(() => {
  if (interestedTargets.length === 0 && blast?.status === 'active') {
    const t = window.setInterval(() => setSearchStage((s) => s + 1), 3000);
    return () => window.clearInterval(t);
  }
}, [interestedTargets.length, blast?.status]);

// In render:
{interestedTargets.length === 0 && (
  <DriverSearchAnimation stage={searchStage} />
)}
```

**No-Match Coaching** (when timer expires with 0 HMUs):
```tsx
// In no-match fallback modal (line 286), replace generic text:
<h3 className="text-lg font-bold">No drivers available</h3>
<p className="text-sm text-neutral-400 mt-1">
  We checked {targets.length} driver{targets.length === 1 ? '' : 's'} in your area.
  {blast.driverPreference !== 'any' && ' Your gender preference may have limited matches.'}
  {blast.price < 20 && ' Low price may have deterred drivers.'}
  {blast.storage && ' Storage request may have limited options.'}
</p>
<p className="text-xs text-neutral-500 mt-2">
  Try increasing your price — drivers may adjust for gas costs.
</p>
```

---

### P1 — Countdown Timer Prominence

**Fix**:
```tsx
// app/rider/blast/[id]/blast-board-client.tsx:203-207
// Replace:
<div className="text-[11px] text-neutral-600 mt-2">
  {msLeft && msLeft > 0
    ? `${minutesLeft}:${String(secondsLeft).padStart(2, '0')} left`
    : 'Time's up'}
</div>
// With:
<div className="mt-3 flex items-center gap-2">
  <div
    className="text-3xl font-bold tabular-nums"
    style={{
      fontFamily: 'var(--font-display)',
      color: pctLeft > 0.33 ? '#ffffff' : pctLeft > 0.07 ? '#fbbf24' : '#ef4444',
    }}
  >
    {minutesLeft}:{String(secondsLeft).padStart(2, '0')}
  </div>
  <div className="text-xs text-neutral-500">left</div>
</div>
```

---

### P1 — Real-Time Driver Loading (No Refresh)

**Optimistic Ably Integration**:
```tsx
// app/rider/blast/[id]/blast-board-client.tsx:73-79
// Replace:
onMessage: (msg) => {
  if (msg.name === 'target_hmu' || msg.name === 'bumped' || msg.name === 'match_locked' || msg.name === 'cancelled') {
    refresh();
  }
},
// With:
onMessage: (msg) => {
  if (msg.name === 'target_hmu') {
    // Optimistic append: add the new driver immediately
    const newTarget = msg.data as Target;
    setTargets((prev) => {
      const exists = prev.some((t) => t.targetId === newTarget.targetId);
      if (exists) return prev;
      return [...prev, newTarget];
    });
  } else if (msg.name === 'match_locked' || msg.name === 'cancelled' || msg.name === 'bumped') {
    refresh(); // Full re-fetch for state changes
  }
},
```

**Backend Requirement** (already implemented in `/api/blast/[id]/select/[targetId]/route.ts`):
Ably publish on HMU includes full target + driver payload, so client can render immediately

---

### P2 — Photo Upload Race Condition

**Fix** (more defensive error check):
```tsx
// app/rider/blast/new/blast-form-client.tsx:884-889
// Change:
const data = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
if (!res.ok || !data.url) {
  setError(data.error || 'Upload failed. Try again.');
  setUploading(false);
  return;
}
// To:
const data = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
// If we have a preview URL and the response is 200, assume success even if URL parsing failed
if (res.ok && (data.url || previewUrl)) {
  const finalUrl = data.url || previewUrl!;
  onUploaded(finalUrl);
  return;
}
if (!res.ok || !data.url) {
  setError(data.error || 'Upload failed. Try again.');
  setUploading(false);
  return;
}
```

---

## TESTING CHECKLIST

After implementing fixes:

- [ ] Name step: text field visible below header on 390px screen
- [ ] Random name pre-fills on gender selection (woman / man)
- [ ] "Almost there, [Name]!" uses display font + larger size
- [ ] Photo upload shows retry button on error
- [ ] "Get My Ride" button shows inline spinner when submitting
- [ ] Offer board: address subtitle visible below header
- [ ] Countdown timer: 3xl size, color-coded (white → amber → red)
- [ ] Driver search shows rotating stages (3 steps, 3-sec each)
- [ ] No-match modal includes coaching based on blast criteria
- [ ] New driver HMU appears instantly via Ably (no page refresh)
- [ ] Photo upload doesn't show false error when successful

---

## IMPLEMENTATION ORDER

1. **Header overlap fixes** (5 min) — blocking UX bug
2. **Random name generation** (10 min) — adds delight + reduces friction
3. **"Almost There" typography** (2 min) — quick polish win
4. **Countdown timer prominence** (5 min) — improves urgency perception
5. **Driver search animation** (20 min) — better perceived performance
6. **Real-time driver loading** (15 min) — eliminates jarring refresh
7. **Loading indicators** (10 min) — reduces user anxiety
8. **Photo upload race condition** (5 min) — edge case fix
9. **No-match coaching** (10 min) — improves conversion on failure

**Total estimate**: ~90 minutes for all fixes

---

## FILES TO MODIFY

1. `app/rider/blast/new/blast-form-client.tsx` (name gen, header fix, typography, photo error)
2. `app/rider/blast/[id]/blast-board-client.tsx` (header fix, countdown, animation, real-time, no-match coaching)

---

## RELATED DOCS
- [Blast Booking Spec](./BLAST-BOOKING-SPEC.md) — Full feature specification
- [UI Components](./UI-COMPONENTS.md) — Design system tokens
- [Realtime](./REALTIME.md) — Ably channel architecture
