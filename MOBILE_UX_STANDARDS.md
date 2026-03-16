# Mobile-First UX Standards & Best Practices

## 📱 Core Principles

### 1. Thumb-Friendly Design
- **Touch targets**: Minimum 44x44px (iOS) / 48x48px (Android)
- **Primary actions**: Bottom 1/3 of screen (thumb zone)
- **Navigation**: Bottom tab bar, not top
- **Spacing**: Minimum 8px between interactive elements

### 2. Vertical Scrolling Optimization
- **Infinite scroll**: Use for feeds (rides, comments)
- **Pull-to-refresh**: Standard iOS/Android pattern
- **Sticky headers**: Keep context visible while scrolling
- **Progressive disclosure**: Show more on scroll, not clicks

### 3. Progressive Loading
- **Skeleton screens**: Show layout before data loads
- **Optimistic UI**: Update immediately, rollback on error
- **Lazy loading**: Load images/videos as user scrolls
- **Pagination**: 10-20 items per page, load more on scroll

---

## 🎨 Component Sizing Standards

### Typography Scale (Mobile-First)
```css
--text-xs: 12px;    /* Metadata, timestamps */
--text-sm: 14px;    /* Body text, descriptions */
--text-base: 16px;  /* Default body, inputs */
--text-lg: 18px;    /* Subheadings */
--text-xl: 24px;    /* Headings */
--text-2xl: 32px;   /* Page titles */
--text-3xl: 48px;   /* Hero text */
```

### Spacing Scale
```css
--space-1: 4px;     /* Tight spacing */
--space-2: 8px;     /* Default spacing */
--space-3: 12px;    /* Medium spacing */
--space-4: 16px;    /* Large spacing */
--space-6: 24px;    /* Section spacing */
--space-8: 32px;    /* Page padding */
```

### Card & Container Sizing
```tsx
// Default card
<Card>
  padding: 16px (--space-4)
  borderRadius: 12px
  minHeight: 80px (for touch targets)
</Card>

// Feed item
<FeedCard>
  padding: 16px 20px
  margin: 0 0 12px 0
  minHeight: 100px
</FeedCard>

// Full-width CTA
<Button variant="primary">
  height: 56px (easy thumb reach)
  fontSize: 18px
  fontWeight: 600
</Button>
```

---

## 🔄 Customer Lifecycle UX Mapping

### Stage 1: New User (Day 0)
**Goal**: Complete first ride within 48 hours

**UX**:
```tsx
// Large, confident CTAs
<Hero>
  <Text size="3xl">Get a ride in minutes</Text>
  <Button size="xl" fullWidth>
    Request Your First Ride
  </Button>
</Hero>

// Simple onboarding (3 steps max)
<ProgressBar steps={3} current={1} />

// Contextual help
<Tooltip trigger="hover">
  Tap to record a 5-second intro video
</Tooltip>
```

**Metrics to Track**:
- Time to complete profile
- Video verification rate
- Payment method add rate
- First ride request rate

---

### Stage 2: Onboarding (Rides 0, Days 1-7)
**Goal**: Complete first ride, understand value

**UX**:
```tsx
// Prominent tutorial overlays
<TutorialOverlay step={1}>
  <Arrow pointing="down" />
  <Text>Tap here to see nearby drivers</Text>
  <Button onClick={nextTip}>Got it</Button>
</TutorialOverlay>

// Celebrate milestones
<Confetti when={firstRideCompleted} />
<Modal>
  <Text size="xl">🎉 First ride complete!</Text>
  <Text>You're now part of the HMU community</Text>
  <Button>Invite a Friend</Button>
</Modal>

// Encourage repeat behavior
<Card>
  <Text>Going back home?</Text>
  <Button>Book Return Ride</Button>
</Card>
```

**Metrics**:
- First ride completion rate
- Time from signup to first ride
- Tutorial completion rate

---

### Stage 3: Activation (Rides 1-4, Weeks 2-4)
**Goal**: Build habit, save favorites

**UX**:
```tsx
// Habit formation prompts
<Card>
  <ProgressRing current={2} target={5} />
  <Text>2 of 5 rides to unlock priority matching</Text>
</Card>

// Route saving suggestions
<Suggestion>
  <Text>You've taken this route twice!</Text>
  <Button onClick={saveRoute}>
    Save "Home → Work"
  </Button>
</Suggestion>

// Driver favoriting
<DriverCard>
  <HeartButton onClick={favorite}>
    Add to Favorites
  </HeartButton>
</DriverCard>
```

**Metrics**:
- Rides per week
- Routes saved
- Drivers favorited
- Repeat booking rate

---

### Stage 4: Growth (Rides 5-19, Months 1-3)
**Goal**: Increase frequency, explore features

**UX**:
```tsx
// Personalized feed
<Feed>
  {preferredDrivers.map(driver => (
    <DriverCard priority>
      <Badge>Your Favorite Driver</Badge>
      <QuickBookButton driver={driver} />
    </DriverCard>
  ))}
</Feed>

// Referral incentives
<ReferralCard>
  <Text>Give $10, Get $10</Text>
  <ShareButton>
    Invite Friends
  </ShareButton>
</ReferralCard>

// Gamification
<StatsCard>
  <Stat label="Lifetime Rides" value={12} />
  <Stat label="Next Milestone" value="20 rides" />
  <Badge>Regular Rider 🌟</Badge>
</StatsCard>
```

**Metrics**:
- Monthly active rides
- Referrals sent
- Feature adoption (saved routes, favorites)

---

### Stage 5: Retention (Rides 20+, Months 3+)
**Goal**: Maintain engagement, prevent churn

**UX**:
```tsx
// VIP treatment
<Header>
  <Badge variant="gold">VIP Member</Badge>
  <Text>Welcome back, power rider!</Text>
</Header>

// Personalized shortcuts
<QuickActions>
  <Button onClick={repeatLastRoute}>
    📍 Repeat Last Route
  </Button>
  <Button onClick={bookFavorite}>
    ⭐ Book Marcus
  </Button>
</QuickActions>

// Loyalty rewards
<RewardsCard>
  <Text>You've saved $47 this month!</Text>
  <ProgressBar label="Next reward in 3 rides" />
</RewardsCard>
```

**Metrics**:
- Churn risk score
- Days since last ride
- Lifetime value
- NPS score

---

### Stage 6: At-Risk (No ride in 14+ days)
**Goal**: Re-engage with incentives

**UX**:
```tsx
// Compelling re-activation
<Hero variant="gradient">
  <Text size="2xl">We've missed you! 💙</Text>
  <DiscountBadge>20% OFF</DiscountBadge>
  <Button size="xl">
    Book Your Comeback Ride
  </Button>
</Hero>

// Show what's new
<WhatsNewCarousel>
  <Slide>
    <Text>New drivers in your area</Text>
  </Slide>
  <Slide>
    <Text>Faster matching</Text>
  </Slide>
</WhatsNewCarousel>
```

**Metrics**:
- Reactivation rate
- Discount redemption
- Time to next ride

---

## 📊 Conversion Optimization

### Key Conversion Funnels

**Signup → First Ride**:
1. Landing page visit
2. Sign up started
3. Profile completed
4. Payment added ← **Drop-off point**
5. First ride requested ← **Drop-off point**
6. First ride completed ✅

**Optimization**:
```tsx
// Reduce friction at payment step
<PaymentStep>
  <TrustBadges>
    <Badge>🔒 Secure</Badge>
    <Badge>💳 No charge until ride</Badge>
  </TrustBadges>

  {/* Show value prop */}
  <Text>You're 1 step away from your first ride</Text>
</PaymentStep>

// Nudge at ride request
<RideRequestPrompt>
  <Text>{nearbyDrivers} drivers nearby</Text>
  <Text muted>Average wait: 3 minutes</Text>
</RideRequestPrompt>
```

---

## 🎯 Engagement Best Practices

### 1. Notifications (Contextual, Not Spammy)
```tsx
// Triggered by user behavior
onRideCompleted(() => {
  sendPush({
    title: "Rate your ride with Marcus",
    body: "How was your experience?",
    delay: "2 minutes"
  });
});

// Personalized timing
if (userPattern.ridesOnMondays) {
  sendPush({
    title: "Need a ride today?",
    body: "Book your usual Monday route",
    schedule: "Monday 8am"
  });
}
```

### 2. In-App Messaging (Contextual)
```tsx
// Show only when relevant
{hasUnreadComments && (
  <Toast>
    <Text>Marcus replied to your ride request</Text>
    <Button>View Message</Button>
  </Toast>
)}

// Encourage next action
{justCompletedRide && !hasRating && (
  <BottomSheet>
    <Text>Quick! Rate your ride</Text>
    <StarRating />
  </BottomSheet>
)}
```

### 3. Social Proof
```tsx
<FeedItem>
  <AvatarGroup>
    {recentRiders.map(r => <Avatar key={r.id} src={r.video} />)}
  </AvatarGroup>
  <Text>23 people booked rides in the last hour</Text>
</FeedItem>
```

---

## ♿ Accessibility Standards

### 1. Screen Reader Support
```tsx
<Button
  aria-label="Request a ride from your current location to the airport"
  role="button"
>
  Request Ride
</Button>

<Image
  alt="Driver Marcus in a gray Honda Civic"
  src={driver.photo}
/>
```

### 2. Keyboard Navigation
```tsx
// All interactive elements tabbable
<Card tabIndex={0} role="button">
  <Text>Ride Request</Text>
</Card>

// Skip to content
<SkipLink href="#main">
  Skip to ride requests
</SkipLink>
```

### 3. Color Contrast
- Text: Minimum 4.5:1 ratio
- Large text (18px+): Minimum 3:1 ratio
- Interactive elements: Minimum 3:1 ratio

---

## 🚀 Performance Optimization

### 1. Perceived Performance
```tsx
// Show skeleton while loading
{loading && <RideCardSkeleton />}

// Optimistic updates
onClick={() => {
  // Update UI immediately
  setRides([newRide, ...rides]);

  // Send request in background
  createRide(data).catch(() => {
    // Rollback on error
    setRides(rides);
  });
}}
```

### 2. Image/Video Optimization
```tsx
<VideoAvatar
  src={user.videoUrl}
  poster={user.thumbnail} // Show while loading
  preload="metadata"
  width={80}
  height={80}
/>

// Lazy load images below fold
<Image
  src={driver.photo}
  loading="lazy"
  decoding="async"
/>
```

### 3. Code Splitting
```tsx
// Lazy load heavy components
const RideHistory = lazy(() => import('./RideHistory'));

<Suspense fallback={<Skeleton />}>
  <RideHistory />
</Suspense>
```

---

## 📈 A/B Testing Framework

### Test Personalization by Lifecycle
```tsx
// Different CTAs by stage
function getPrimaryCTA(stage) {
  switch(stage) {
    case 'onboarding':
      return "Request Your First Ride 🎉";
    case 'activation':
      return "Book Another Ride";
    case 'growth':
      return "Quick Book Favorite Driver";
    case 'retention':
      return "Repeat Last Route";
    default:
      return "Request a Ride";
  }
}
```

### Track Variants
```tsx
// Log A/B test exposure
trackActivity({
  event: 'ab_test_exposure',
  properties: {
    test: 'cta_variant',
    variant: 'emoji',
    stage: userStage
  }
});
```

---

## ✅ Implementation Checklist

**Mobile-First Design**:
- [ ] All touch targets ≥ 48x48px
- [ ] Primary actions in bottom 1/3
- [ ] Vertical scrolling (no horizontal)
- [ ] Thumb-friendly navigation

**Performance**:
- [ ] Skeleton screens on load
- [ ] Optimistic UI updates
- [ ] Lazy load images
- [ ] Code split heavy components

**Lifecycle Personalization**:
- [ ] Track user stage (onboarding/activation/growth/retention)
- [ ] Personalized CTAs by stage
- [ ] Milestone celebrations
- [ ] Re-engagement for at-risk users

**Conversion Optimization**:
- [ ] Reduce signup friction (3 steps max)
- [ ] Trust signals at payment step
- [ ] Social proof throughout
- [ ] Clear progress indicators

**Engagement**:
- [ ] Contextual notifications
- [ ] In-app messaging
- [ ] Habit formation prompts
- [ ] Gamification (badges, milestones)

**Accessibility**:
- [ ] ARIA labels on interactive elements
- [ ] Keyboard navigation support
- [ ] Color contrast ≥ 4.5:1
- [ ] Screen reader tested
