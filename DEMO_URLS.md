# HMU ATL Demo URLs

## 🌐 Access the Demos

### **Public URL (Mobile-Friendly)**
**ngrok URL:** https://navally-sirenic-alisson.ngrok-free.dev

### **Local URL**
**localhost:** http://localhost:3000

---

## 📱 Demo Pages

### 1. **Demo Landing Page**
Choose which experience to explore

- **Public:** https://navally-sirenic-alisson.ngrok-free.dev
- **Local:** http://localhost:3000

### 2. **Rider Onboarding**
Complete 4-step onboarding flow

- **Public:** https://navally-sirenic-alisson.ngrok-free.dev/onboarding
- **Local:** http://localhost:3000/onboarding

**Features:**
- Profile creation (name, gender, pronouns)
- Hybrid video recorder (5-second intro)
- Safety preferences (optional)
- Payment setup with Stripe

### 3. **Rider Experience**
Browse available drivers and request rides

- **Public:** https://navally-sirenic-alisson.ngrok-free.dev/rider
- **Local:** http://localhost:3000/rider

**Features:**
- TikTok-style driver feed
- Swipeable video cards
- Match scoring (up to 95%)
- Ride request composer
- Tutorial walkthrough

**Gestures:**
- Swipe right → Request ride
- Swipe left → Skip driver
- Tap video → Play/pause
- Tap + button → Open ride request

### 4. **Driver Experience**
View ride requests and accept/counter offers

- **Public:** https://navally-sirenic-alisson.ngrok-free.dev/driver
- **Local:** http://localhost:3000/driver

**Features:**
- TikTok-style rider feed
- Swipeable rider cards
- Offer amounts and routes
- Accept/counter/skip actions
- Tutorial walkthrough

**Gestures:**
- Swipe right → Accept ride
- Swipe left → Skip request
- Tap video → Play/pause
- Tap buttons → Counter offer

---

## 🎯 Best Viewing Experience

### **Recommended:**
1. **Mobile Phone** - Open ngrok URL on your phone
2. **Chrome DevTools** - Responsive mode (375x812 - iPhone X)
3. **Narrow Browser** - Resize to ~375px width

### **Mock Data Available:**
- 3 mock drivers (Sarah, Marcus, Alex)
- 3 mock riders (Emma, Jordan, Michael)
- All with videos, ratings, and safety badges
- Match scores: 76% - 95%

---

## 🧪 Testing Features

### Rider Flow:
1. Visit `/onboarding`
2. Complete 4 steps (can skip safety preferences)
3. Click "Show Tutorial" in `/rider` to see walkthrough
4. Swipe through driver cards
5. Tap + button to request a ride
6. Fill out 4-step ride request

### Driver Flow:
1. Visit `/driver`
2. Click "Show Tutorial" to see walkthrough
3. Swipe through rider requests
4. See offer amounts and route details
5. Accept, counter, or skip

---

## 🎨 UI Highlights

- **Purple/Pink gradients** throughout
- **Video backgrounds** on cards (auto-play)
- **Match score badges** (heart + percentage)
- **LGBTQ+ friendly badges** (rainbow flag)
- **Verification badges** (blue checkmark)
- **Smooth animations** (Framer Motion)
- **Card stacking** (next card preview)
- **Progress indicators** (dots at bottom)

---

## 🔧 Known Demo Limitations

1. Videos are sample MP4s (not actual user videos)
2. No real database (mock data only)
3. Swipe actions log to console
4. Payment setup won't actually charge
5. Google Places not integrated (placeholders)
6. Real-time updates not enabled

---

## 📱 QR Code Access

Scan this with your phone to access the demo:

```
████ ▄▄▄▄▄ █▀▀▀▄ █▄ █ ▄▄▄▄▄ ████
████ █   █ █ ▄▀▄ ██ ▄ █   █ ████
████ █▄▄▄█ █▄▄▄▀ ▀█▀█ █▄▄▄█ ████
████▄▄▄▄▄▄▄█ ▀ █ ▀ █ ▄▄▄▄▄▄▄████
████▄█▀  ▀▄▄▀██ ▀▄▄▀█▀▄ █▀▀▄████
████▄▀ ▀█ ▄  █▀▀▀██  █▀▄█▄▀▀████
████ ▄▄▄▄▄ █▀▄▄▀█ ▀██ ▄█ ▀▀█████
████ █   █ █ ▀█▄▀  ██▀▀▄█ ██████
████ █▄▄▄█ █  ▀  █▄▀█ █▀ ▄▀█████
████▄▄▄▄▄▄▄█▄▄▄█▄▄███▄████▄█████

https://navally-sirenic-alisson.ngrok-free.dev
```

---

## 💡 Tips

- **Portrait mode** works best
- **Enable sound** to hear video audio
- **Allow location** for "Use Current Location" (not yet implemented)
- **Clear browsing data** if styles don't load
- **Refresh** if videos don't play

---

## 🚀 Next Steps for Production

1. Replace mock data with real API calls
2. Integrate Cloudflare Stream for videos
3. Connect Stripe for real payments
4. Add Google Maps for location picking
5. Enable real-time updates (Ably)
6. Build backend endpoints
7. Deploy to Cloudflare Pages

---

**Enjoy the demo! 🎉**
