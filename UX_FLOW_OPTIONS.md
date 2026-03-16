# HMU ATL - UX Flow Options (Post-Style Interface)

> **Goal**: Make requesting/offering rides feel like making a social media post
> **Safety First**: Gender, orientation, rating filters for rider/driver comfort

---

## 🚗 RIDER EXPERIENCE OPTIONS

### Option A: "Quick Post" (Instagram Story Style)

**Flow**:
1. Tap floating "+" button (bottom right, thumb zone)
2. Swipe up to reveal composer (80% screen height)
3. Fill in minimal details with smart defaults

**Screen Layout**:
```
┌─────────────────────────────────────┐
│  Where to?                      [X] │
├─────────────────────────────────────┤
│                                     │
│  📍 From: [Current Location ▾]     │
│     123 Main St, Atlanta           │
│                                     │
│  📍 To: [Tap to add destination]   │
│                                     │
│  + Add stop (optional)              │
│                                     │
│  💰 Your offer: [$25]              │
│     Suggested: $22-28               │
│                                     │
│  👥 Preferences (optional)          │
│     [ ] Women drivers only          │
│     [ ] LGBTQ+ friendly             │
│     [ ] 4.5+ rating                 │
│                                     │
│  🕐 When? [Now ▾] [In 30 min]      │
│                                     │
│  💬 Add note (optional)             │
│     "Running late, quick ride!"     │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  [Post Ride Request] ← Big CTA     │
│                                     │
└─────────────────────────────────────┘
```

**After Posting**:
```
┌─────────────────────────────────────┐
│  ✓ Posted!                          │
│                                     │
│  🔍 Finding drivers...              │
│  [Animation: Ripple effect]         │
│                                     │
│  3 drivers nearby match your        │
│  preferences                        │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 👤 Marcus | ⭐ 4.9 | 🚗 2 min │ │
│  │ 2019 Honda Civic · Gray        │ │
│  │ "Happy to help!" [Accept $25]  │ │
│  │ [View Profile] [Message]       │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 👤 Sarah | ⭐ 5.0 | 🚗 4 min  │ │
│  │ 2021 Tesla Y · White           │ │
│  │ "On my way!" [Accept $25]      │ │
│  │ [View Profile] [Message]       │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

---

### Option B: "Feed First" (TikTok Discovery Style)

**Flow**:
1. Open app → See feed of available drivers (like TikTok For You)
2. Swipe through driver profiles/videos
3. Tap "Request Ride" on any driver

**Home Screen**:
```
┌─────────────────────────────────────┐
│  Drivers Near You            [@You]│
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │   [Driver Profile Video]     │   │
│  │   Marcus - 2 min away        │   │
│  │   ⭐ 4.9 (248 rides)          │   │
│  │                              │   │
│  │   "Headed to Midtown,        │   │
│  │    happy to give rides!"     │   │
│  │                              │   │
│  │   📍 Available: Buckhead →   │   │
│  │      Midtown → Downtown      │   │
│  │                              │   │
│  │   [Request Ride with Marcus] │   │
│  └─────────────────────────────┘   │
│                                     │
│  ← Swipe to see more drivers        │
│                                     │
└─────────────────────────────────────┘
```

**Request Flow** (after tapping driver):
```
┌─────────────────────────────────────┐
│  Request Ride with Marcus       [X] │
├─────────────────────────────────────┤
│                                     │
│  📍 Pick me up at:                  │
│     [Current Location ▾]            │
│                                     │
│  📍 Drop me off at:                 │
│     [Tap to enter address]          │
│                                     │
│  💰 Your offer: [$25]              │
│                                     │
│  💬 Message Marcus (optional)       │
│     "Hi! Can you pick me up in 5?"  │
│                                     │
│  [Send Request]                     │
│                                     │
└─────────────────────────────────────┘
```

---

### Option C: "Map + Post" (Uber Hybrid)

**Flow**:
1. Map shows nearby drivers (animated cars)
2. Bottom sheet with "Post Ride" form
3. Drivers see post and respond

**Screen Layout**:
```
┌─────────────────────────────────────┐
│  [Map View - 60% of screen]        │
│                                     │
│  🚗 (Marcus - 2min)                 │
│        🚗 (Sarah - 4min)            │
│                                     │
│  📍 [Your location pin]             │
│                                     │
├─────────────────────────────────────┤
│  Post Your Ride                 [↑] │
├─────────────────────────────────────┤
│  📍 From: [Current Location]        │
│  📍 To: [Tap to add]                │
│                                     │
│  💰 $[25] · 👥 Preferences          │
│                                     │
│  [Post to 5 nearby drivers]         │
└─────────────────────────────────────┘
```

---

## 🏎️ DRIVER EXPERIENCE OPTIONS

### Option A: "Broadcast Availability" (LinkedIn Post Style)

**Flow**:
1. Driver creates "availability post" for the day
2. Post shows: areas, times, pricing, vehicle, preferences
3. Riders see post in feed and request

**Create Availability Post**:
```
┌─────────────────────────────────────┐
│  Post Your Availability         [X] │
├─────────────────────────────────────┤
│                                     │
│  📍 Where I'm driving today:        │
│     [x] Buckhead                    │
│     [x] Midtown                     │
│     [x] Downtown                    │
│     [ ] Airport                     │
│     [ ] Decatur                     │
│                                     │
│  🕐 When I'm available:             │
│     [●] Right now                   │
│     [ ] Later (set time)            │
│                                     │
│  💰 My pricing:                     │
│     Base: [$20]                     │
│     Per mile: [$1.50]               │
│     Per minute: [$0.30]             │
│                                     │
│  🚗 My ride:                        │
│     2019 Honda Civic · Gray         │
│     [Upload photo]                  │
│                                     │
│  👥 I prefer to drive:              │
│     [ ] Women riders only           │
│     [ ] LGBTQ+ friendly             │
│     [ ] 4.5+ rated riders           │
│     [ ] No preference               │
│                                     │
│  💬 Quick intro (optional)          │
│     "Safe driver, good vibes only!" │
│                                     │
│  [Post Availability]                │
│                                     │
└─────────────────────────────────────┘
```

**After Posting**:
```
┌─────────────────────────────────────┐
│  Your Post is Live!             [✓] │
│                                     │
│  📊 3 riders viewing your post      │
│  🔔 2 new ride requests             │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 💬 New Request                 │ │
│  │ Sarah wants a ride             │ │
│  │ From: 123 Main St              │ │
│  │ To: 456 Oak Ave (3.2 mi)       │ │
│  │ Offer: $25                     │ │
│  │ Note: "Need ride by 3pm"       │ │
│  │                                │ │
│  │ [Accept $25] [Counter $28]     │ │
│  │ [Message] [Decline]            │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

---

### Option B: "Request Feed" (Inbox Style)

**Flow**:
1. Drivers go online
2. See feed of ride requests (like an inbox)
3. Accept, counter-offer, or skip

**Ride Request Feed**:
```
┌─────────────────────────────────────┐
│  Ride Requests Near You    [Online]│
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🔵 Sarah · 2 min away · ⭐ 5.0│ │
│  │ From: Buckhead Mall            │ │
│  │ To: Midtown Station (3.2 mi)   │ │
│  │ Offer: $25 · Now               │ │
│  │ Pref: Women drivers preferred  │ │
│  │                                │ │
│  │ [Accept] [Counter] [Skip]      │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🔵 Mike · 5 min away · ⭐ 4.8 │ │
│  │ From: Airport                  │ │
│  │ To: Downtown (12 mi)           │ │
│  │ Offer: $35 · In 30 min         │ │
│  │                                │ │
│  │ [Accept] [Counter] [Skip]      │ │
│  └───────────────────────────────┘ │
│                                     │
│  ← Swipe left to skip →            │
│                                     │
└─────────────────────────────────────┘
```

---

### Option C: "Map + Pings" (Lyft Style)

**Flow**:
1. Map shows driver location + nearby ride requests
2. Ride requests ping driver with audio/vibration
3. Accept in 30 seconds or auto-skip

**Screen Layout**:
```
┌─────────────────────────────────────┐
│  [Map View - Full screen]          │
│                                     │
│  🚗 [Your car]                      │
│                                     │
│  📍 (Sarah - 2 min away)            │
│  📍 (Mike - 5 min away)             │
│                                     │
├─────────────────────────────────────┤
│  🔔 New Request! (15s left)        │
│                                     │
│  Sarah · ⭐ 5.0 · 2 min away       │
│  Buckhead → Midtown (3.2 mi)       │
│  Offer: $25                         │
│                                     │
│  [Accept] [Decline]                 │
│                                     │
└─────────────────────────────────────┘
```

---

## 🔒 SAFETY & MATCHING PREFERENCES

### User Profile - Safety Settings

**Rider Safety Preferences**:
```
┌─────────────────────────────────────┐
│  My Ride Preferences            [✓] │
├─────────────────────────────────────┤
│                                     │
│  👥 Driver Gender Preference:       │
│     ( ) No preference               │
│     ( ) Women drivers only          │
│     ( ) Men drivers only            │
│     (●) Show all, but prefer women  │
│                                     │
│  🏳️‍🌈 LGBTQ+ Friendly:               │
│     [x] Prefer LGBTQ+ friendly      │
│         drivers                     │
│                                     │
│  ⭐ Minimum Driver Rating:          │
│     [●────────○] 4.5+               │
│                                     │
│  🛡️ Additional Safety:              │
│     [x] Share trip details with     │
│         emergency contact           │
│     [x] Require video verification  │
│     [x] Avoid drivers with disputes │
│                                     │
│  📊 Matching Priority:              │
│     1. Safety preferences ✓         │
│     2. Proximity                    │
│     3. Rating                       │
│     4. Price                        │
│                                     │
└─────────────────────────────────────┘
```

**Driver Safety Preferences**:
```
┌─────────────────────────────────────┐
│  My Rider Preferences           [✓] │
├─────────────────────────────────────┤
│                                     │
│  👥 Rider Gender Preference:        │
│     (●) No preference               │
│     ( ) Women riders only           │
│     ( ) Men riders only             │
│                                     │
│  🏳️‍🌈 LGBTQ+ Friendly:               │
│     [x] Open to LGBTQ+ riders       │
│                                     │
│  ⭐ Minimum Rider Rating:           │
│     [●────────○] 4.0+               │
│                                     │
│  🛡️ Additional Safety:              │
│     [x] Require rider verification  │
│     [x] Avoid riders with disputes  │
│     [ ] Short trips only (<10 mi)   │
│                                     │
│  📊 Request Filtering:              │
│     [x] Show only matched riders    │
│     [ ] Show all, highlight matches │
│                                     │
└─────────────────────────────────────┘
```

---

## 🎯 MATCHING ALGORITHM LOGIC

### Priority Filters (Applied in Order):

**1. Safety Filters (MUST MATCH)**:
```typescript
// Hard filters - requests rejected if don't match
- Gender preference (if strict)
- LGBTQ+ friendly flag
- Minimum rating requirement
- Verification status
- Active disputes/blocks
```

**2. Proximity Filters**:
```typescript
// Distance-based
- Driver within N miles of pickup
- Estimated ETA < 10 minutes
- Driver heading same direction (optional boost)
```

**3. Soft Preferences (SCORE-BASED)**:
```typescript
// Ranked by score
+ 100 pts: Perfect gender match
+ 50 pts: LGBTQ+ friendly match
+ 20 pts: Rating > 4.8
+ 10 pts: Completed rides together before
+ 5 pts: Similar price range
- 20 pts: Price significantly off
```

**4. Final Ranking**:
```typescript
// Sort by total score, show top 5-10 matches
riders.sort((a, b) => {
  if (a.safetyScore !== b.safetyScore) {
    return b.safetyScore - a.safetyScore; // Safety first
  }
  if (a.proximity !== b.proximity) {
    return a.proximity - b.proximity; // Then proximity
  }
  return b.rating - a.rating; // Finally rating
});
```

---

## 📊 COMPARISON TABLE

| Feature | Option A (Quick Post) | Option B (Feed First) | Option C (Map + Post) |
|---------|----------------------|----------------------|----------------------|
| **Speed** | ⚡⚡⚡ Fastest | ⚡⚡ Medium | ⚡ Slower |
| **Discovery** | ⚡ Low | ⚡⚡⚡ High | ⚡⚡ Medium |
| **Control** | ⚡⚡⚡ Full control | ⚡⚡ Limited | ⚡⚡⚡ Full control |
| **Social Feel** | ⚡⚡ Post-like | ⚡⚡⚡ Very social | ⚡ Less social |
| **Learning Curve** | ⚡⚡⚡ Easy | ⚡⚡ Medium | ⚡ Familiar (Uber-like) |
| **Best For** | Power users | Explorers | Uber migrants |

---

## 💡 RECOMMENDED HYBRID APPROACH

**Combine the best of all options**:

1. **Primary Flow**: Option A (Quick Post) for speed
2. **Discovery Tab**: Option B (Feed First) for browsing drivers
3. **Map View**: Option C available as toggle

**Navigation**:
```
┌─────────────────────────────────────┐
│                                     │
│  [Bottom Nav Bar]                   │
│                                     │
│  [🏠 Feed] [🗺️ Map] [➕ Post] [💬] [👤] │
│                                     │
└─────────────────────────────────────┘
```

- **Feed**: Browse drivers/riders
- **Map**: See real-time locations
- **Post**: Quick ride request (primary action)
- **Messages**: Active conversations
- **Profile**: Settings + safety preferences

---

## 🎨 VISUAL DESIGN NOTES

**Post Composer Style**:
- Slide up from bottom (like Instagram)
- Frosted glass background
- Large, thumb-friendly inputs
- Auto-complete for addresses
- Smart defaults (current location, "now", suggested price)

**Driver/Rider Cards**:
- Profile video preview (auto-play on scroll)
- Large profile photo if no video
- Verified badges (✓ Video verified, ✓ Background check)
- Quick stats (rating, rides, response time)
- Safety badges (LGBTQ+ friendly, Women-owned, etc.)

**Matching Indicators**:
- Green badge: Perfect match
- Yellow badge: Partial match
- Gray badge: Doesn't match preferences (but still shown)

---

## 🚀 NEXT STEPS TO IMPLEMENT

1. **Choose primary flow** (I recommend Hybrid)
2. **Build safety preferences schema**
3. **Update matching algorithm** with filters
4. **Design components** (post composer, driver cards)
5. **Test with real users** for safety feedback

What flow do you prefer? Or should we go with the hybrid approach?
