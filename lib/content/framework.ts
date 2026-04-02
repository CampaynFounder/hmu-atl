// HMU CashRide Video Content Engine — Framework Config
// Source of truth for all hooks, segments, tempos, psych frameworks, calendar, and CTAs.
// Feeds both the admin UI (dropdowns, reference view) and the Claude API system prompt.

export interface HookArchetype {
  id: string;
  number: string;
  name: string;
  title: string;
  psychology: string;
  visual: string;
  vo: string;
  text: string;
  example: string;
  promptInstruction: string;
}

export interface AudienceSegment {
  id: string;
  label: string;
  badge: string;
  avatar: string;
  painDefault: string;
  proofDefault: string;
  environment: string;
}

export interface PainPoint {
  id: string;
  name: string;
  description: string;
  solution: string;
  stat: string;
  badge: string;
}

export interface TempoMap {
  id: string;
  name: string;
  bpmRange: string;
  bpm: number;
  barLength: number;
  cutsPerThirty: string;
  maxWords: string;
  feel: string;
  bestFor: string;
  timingMap: string;
  songRec: string;
}

export interface PsychFramework {
  id: number;
  name: string;
  author: string;
  badge: string;
  principle: string;
  application: string;
  inContent: string;
  promptInstruction: string;
}

export interface TrendType {
  id: string;
  name: string;
  badge: string;
  description: string;
  example: string;
  strategy: string;
  hookRec: string;
  velocity: string;
}

export interface CalendarDay {
  day: string;
  badge: string;
  theme: string;
  segment: string;
  hook: string;
  tempo: string;
  content: string;
  cta: string;
  goal: string;
}

export interface CTACategory {
  name: string;
  badge: string;
  ctas: string[];
}

// ============================================================
// HOOK ARCHETYPES
// ============================================================

export const HOOK_ARCHETYPES: HookArchetype[] = [
  {
    id: 'receipt',
    number: '01',
    name: 'The Receipt Reveal',
    title: 'Show the exploitation with hard numbers',
    psychology: 'Cognitive dissonance + outrage. When drivers see the gap between rider payment and driver payout, they can\'t scroll past.',
    visual: 'Side-by-side of rider receipt ($28) vs driver payout ($11). Slow zoom on the gap.',
    vo: '"The rider paid $28. I got $11. Where did the other $17 go?"',
    text: 'Rider paid: $28 | You got: $11',
    example: '"I screenshot every ride now. Here\'s what Uber ACTUALLY takes from you."',
    promptInstruction: 'Frame 0:00-0:02: Split screen or side-by-side. Left: rider receipt showing total. Right: driver payout showing net. No logo, no brand. Let the numbers speak. Slow zoom into the gap between the two numbers.',
  },
  {
    id: 'deactivation',
    number: '02',
    name: 'The Deactivation Story',
    title: 'Trigger the universal driver fear',
    psychology: 'Loss aversion + tribal identification. Every driver knows someone this happened to, or fears it happening to them.',
    visual: 'Phone screen showing "Your account has been deactivated" email. Push-in. Face reaction.',
    vo: '"1,847 rides. 4.96 rating. Deactivated on a Tuesday. No warning."',
    text: '1,847 rides. 4.96 stars. Deactivated.',
    example: '"They deactivated me after 2 years. Best thing that ever happened."',
    promptInstruction: 'Frame 0:00-0:03: Close-up of phone screen showing deactivation email. Slow push-in. Cut to driver face — shock, disbelief. Raw, unlit, authentic. Hold the emotion.',
  },
  {
    id: 'math',
    number: '03',
    name: 'The Math Hook',
    title: 'Make the cost of staying undeniable',
    psychology: 'Loss aversion + anchoring. Once they see the annual number, they can\'t unsee it.',
    visual: 'Calculator or handwritten math. Numbers appearing one by one, beat-synced.',
    vo: '"If Uber takes $8 per ride... times 20 rides a day... that\'s $160. Every. Single. Day."',
    text: '$8 x 20 rides = $160/DAY → $57,600/YEAR',
    example: '"I did the math on what Uber took from me last year. I almost threw up."',
    promptInstruction: 'Frame 0:00-0:02: Calculator app or notepad. First number appears on beat 1. Each subsequent number appears on a downbeat. The final annual total ($57,600) hits on a cymbal or snare. Large, bold, center frame.',
  },
  {
    id: 'callout',
    number: '04',
    name: 'The Group Callout',
    title: 'Direct address to FB group identity',
    psychology: 'Identity recognition + in-group signaling. Naming the specific group/behavior makes it impossible to ignore.',
    visual: 'Face to camera, car interior. Direct eye contact. Casual, authentic.',
    vo: '"If you\'re in this group posting \'anyone need a ride\' — you need to hear this."',
    text: 'To everyone in this group doing cash rides...',
    example: '"To every driver in this group doing cash rides off Facebook — stop leaving money on the table."',
    promptInstruction: 'Frame 0:00-0:02: Tight face shot from car interior. Natural lighting through windshield. Eyes directly into camera lens. Slight lean forward. Text overlay calls out the FB group behavior specifically.',
  },
  {
    id: 'comparison',
    number: '05',
    name: 'The Side-by-Side',
    title: 'Visual comparison that tells the whole story',
    psychology: 'Contrast effect + instant comprehension. Split screen requires zero explanation.',
    visual: 'Split screen. Left: Uber driver screen. Right: HMU earnings. Same ride distance.',
    vo: '"Same ride. Same car. Same gas. Different payout."',
    text: 'UBER: $11 | HMU: $25.20 — Same ride.',
    example: '"Left: what Uber pays. Right: what I keep. Same ride. You do the math."',
    promptInstruction: 'Frame 0:00-0:02: Split screen, hard vertical divide. Left side (slightly desaturated): Uber driver payout. Right side (vivid, green tint): HMU payout. Same trip distance visible on both. No voiceover needed — the visual IS the hook.',
  },
  {
    id: 'testimony',
    number: '06',
    name: 'The Driver Testimony',
    title: 'Real voice, real numbers, real emotion',
    psychology: 'Social proof + parasocial empathy. UGC-style authenticity outperforms polished ads 3:1 with this audience.',
    visual: 'Driver in car, natural lighting, phone propped on dash. UGC authentic style.',
    vo: '"First week on HMU I made $847. I keep 90%. No surge games."',
    text: 'Week 1: $847. Kept 90%.',
    example: '"I was done with Uber 6 months ago. Here\'s what happened since."',
    promptInstruction: 'Frame 0:00-0:03: Selfie-style from car. Driver speaking naturally, not scripted. Background: real car interior, maybe drive-thru or parked. Phone propped, slightly off-angle for authenticity. Natural audio, not studio.',
  },
  {
    id: 'curiosity',
    number: '07',
    name: 'The Open Loop',
    title: 'Start with the result, withhold the method',
    psychology: 'Zeigarnik effect. The brain needs closure on incomplete information. Drives re-watches (algorithm gold).',
    visual: 'Earnings screenshot or cash — but the source/app is hidden or cropped.',
    vo: '"I made $312 yesterday doing rides. Not Uber. Not Lyft. Not Instacart."',
    text: '$312 yesterday. Not Uber. Not Lyft. ???',
    example: '"$1,200 last week. 0% to Uber. I\'ll show you exactly how."',
    promptInstruction: 'Frame 0:00-0:03: Show earnings number or cash count — but crop out or blur the app name. The viewer MUST watch to find out. Text: "$312 yesterday." Then: "Not Uber. Not Lyft. Not Instacart." Each line appears on a beat. Do NOT reveal the source until after 0:15.',
  },
  {
    id: 'controversy',
    number: '08',
    name: 'The Hot Take',
    title: 'Polarizing statement that demands engagement',
    psychology: 'Reactance + tribal loyalty. Comments and shares from agreement AND disagreement both boost distribution.',
    visual: 'Bold white text on solid black. No face. No movement. Let the statement land.',
    vo: '"Uber drivers are not independent contractors. You\'re an employee who pays for their own gas."',
    text: '"You\'re not an independent contractor. You\'re an employee who buys their own gas."',
    example: '"Rideshare apps are the biggest scam in the gig economy. Change my mind."',
    promptInstruction: 'Frame 0:00-0:02: Solid black background. Large bold serif text, center frame: the controversial statement. No voice, no music for 1.5s — silence makes it hit harder. Music kicks in at 0:02. Cut to supporting argument.',
  },
];

// ============================================================
// AUDIENCE SEGMENTS
// ============================================================

export const AUDIENCE_SEGMENTS: AudienceSegment[] = [
  {
    id: 'frustrated',
    label: 'Frustrated Platform Driver',
    badge: 'Segment A',
    avatar: 'Uber/Lyft driver frustrated with platform fees and deactivation threats',
    painDefault: 'Uber takes 40-50% of what the rider pays. One false report = deactivation.',
    proofDefault: 'HMU drivers keep 90% on first $50/day. No deactivation. You own your riders.',
    environment: 'car interior, phone showing Uber/Lyft driver app, gas station, Atlanta streets',
  },
  {
    id: 'independent',
    label: 'Already Independent',
    badge: 'Segment B',
    avatar: 'Independent driver already doing cash rides via Facebook groups and word-of-mouth',
    painDefault: 'Doing cash rides with no payment protection, no rider verification, no dispute system.',
    proofDefault: 'Your money is held safe before you drive. Riders are checked before they ride with you. If something goes wrong, we handle it.',
    environment: 'car interior, phone with FB Messenger open, cash transactions, Atlanta neighborhoods',
  },
  {
    id: 'errand',
    label: 'Errand Runner / Multi-Service',
    badge: 'Segment C',
    avatar: 'Errand runner and multi-service driver doing grocery runs, airport pickups, and weekly rides',
    painDefault: 'Juggling Venmo/CashApp/Zelle with no protection. No way to build a reliable client base.',
    proofDefault: 'One platform for rides, errands, and weekly regulars. Set your own prices. Get paid same day.',
    environment: 'car trunk with groceries, airport terminal, phone with schedule, suburban Atlanta',
  },
  {
    id: 'new',
    label: 'Considering Starting',
    badge: 'Segment D',
    avatar: 'Person with a car considering rideshare as primary or supplemental income',
    painDefault: 'Heard the horror stories about Uber/Lyft. Scared to invest time in a platform that exploits drivers.',
    proofDefault: 'No background check to start. Keep 90% from day one. Sign up in 30 seconds.',
    environment: 'person looking at phone, car in driveway, kitchen table with bills, optimistic tone',
  },
];

// ============================================================
// PAIN MATRIX
// ============================================================

export const PAIN_MATRIX: PainPoint[] = [
  {
    id: 'p1',
    name: 'Platform Exploitation',
    badge: 'P1',
    description: '"Uber takes 40-50% of what the rider pays. I see the rider receipt — I got $8 on a $22 ride." This is the #1 rage trigger.',
    solution: 'HMU: keep 90% on first $50/day. Fees capped at $40/day max.',
    stat: 'Drivers keep 90% on HMU vs ~55% on Uber',
  },
  {
    id: 'p2',
    name: 'Deactivation Fear',
    badge: 'P2',
    description: '"One false report and you\'re done. No appeal, no hearing." Drivers live in constant fear of losing their income overnight.',
    solution: 'HMU: You own your business. No deactivation. Your riders are your clients.',
    stat: '0 drivers deactivated without cause on HMU',
  },
  {
    id: 'p3',
    name: 'No-Tip Culture',
    badge: 'P3',
    description: '"The app tells riders I\'m already paid well. They tip $0 on a 45-min ride." Platform design actively suppresses tipping.',
    solution: 'HMU: Set your own price upfront. Riders see it and agree before you move.',
    stat: 'Drivers set their own prices — no algorithm deciding your worth',
  },
  {
    id: 'p4',
    name: 'Unpredictable Pay',
    badge: 'P4',
    description: '"Monday I make $200. Tuesday the same hours, $80. No explanation." Algorithmic pay manipulation destroys financial planning.',
    solution: 'HMU: See exactly what you earn before accepting. Transparent, no games.',
    stat: 'What you see is what you get — no surge manipulation',
  },
  {
    id: 'p5',
    name: 'Safety Without Support',
    badge: 'P5',
    description: '"I had a dangerous rider and Uber\'s response was a form email." No real-time support, no payment protection, no community backup.',
    solution: 'HMU: Your money is held safe before you move. Riders are checked before they get in. Block anyone, anytime.',
    stat: 'Your money is locked in BEFORE you even start driving',
  },
  {
    id: 'p6',
    name: 'Independence Tax',
    badge: 'P6',
    description: '"I want to go independent but I can\'t process payments, verify riders, or handle disputes." The tools gap keeps them dependent.',
    solution: 'HMU: Full platform — payments, matching, GPS, disputes — without giving up control.',
    stat: 'Full platform tools, you keep control',
  },
];

// ============================================================
// TEMPO MAPS
// ============================================================

export const TEMPO_MAPS: TempoMap[] = [
  {
    id: 'energetic',
    name: 'Energetic',
    bpmRange: '120-140',
    bpm: 128,
    barLength: 1.875,
    cutsPerThirty: '8-12',
    maxWords: '12-14',
    feel: 'Fast cuts, urgency, hype.',
    bestFor: 'Earnings reveals, side-by-side comparisons, "I switched" stories.',
    songRec: 'Trending trap beats, Atlanta hip-hop, bass-heavy. Use TikTok Creative Center for trending sounds.',
    timingMap: `0:00-0:02 — HOOK: Pattern interrupt visual + text overlay on beat 1
            Scene: Receipt screenshot / Bold stat / Split screen
            Text: Large, center frame, appears on the downbeat

0:02-0:06 — PROBLEM: 2 bars, 1 cut per bar
            VO Line 1 (0:02-0:04): "[Pain point]" — max 12 words
            VO Line 2 (0:04-0:06): "[Agitate the pain]" — max 12 words
            Cut on every downbeat

0:06-0:14 — BRIDGE: 4 bars, B-roll or screen demo
            Show the mechanism. How HMU works. App screens, matching flow.
            VO on 8-beat phrases. Cuts every 2 beats (fast energy).

0:14-0:22 — INSTALL MOMENT: Sync to drop/chorus
            Proof cascade: Stat -> Face -> Screenshot (2s each)
            This is the re-watch anchor. Highest energy.

0:22-0:28 — CTA: On beat 2 or 4
            Loss-framed VO: "[Cost of not acting]"
            Text overlay: "[CTA]" — appears on the beat

0:28-0:30 — LOOP FRAME: Matches 0:00 exactly
            Same visual composition. Audio loops clean.`,
  },
  {
    id: 'mid',
    name: 'Mid-Tempo',
    bpmRange: '90-110',
    bpm: 100,
    barLength: 2.4,
    cutsPerThirty: '5-7',
    maxWords: '10-12',
    feel: 'Confident, authoritative.',
    bestFor: 'How-it-works demos, math breakdowns, feature walkthroughs.',
    songRec: 'Lo-fi, chill hop, smooth R&B instrumentals. Confident but not aggressive.',
    timingMap: `0:00-0:03 — HOOK: Confident, direct. Face to camera or clear statement.
            More time to land the message. Let the hook breathe.
            Text: Appears on beat 1, holds through bar 1.

0:03-0:09 — PROBLEM: 2.5 bars, slower cuts allow more VO text
            VO Line 1 (0:03-0:05): "[Specific pain]" — max 10 words
            VO Line 2 (0:05-0:07): "[Why it matters]" — max 10 words
            VO Line 3 (0:07-0:09): "[Bridge to solution]" — max 10 words

0:09-0:18 — DEMO: 3-4 bars, steady rhythm
            App walkthrough or feature demo. Authoritative tone.
            Show the HMU flow: Post -> Match -> Money's held safe -> Drive -> Get paid.
            Cuts on downbeats. Let each shot breathe.

0:18-0:24 — PROOF: Sync to chorus
            Before/after or earnings reveal. Social proof stack.
            Driver face + stat + screenshot.

0:24-0:29 — CTA: Deliberate, clear, 1 action only
            "Link in bio — takes 30 seconds. No background check."

0:29-0:30 — LOOP FRAME: Visual match to 0:00`,
  },
  {
    id: 'slow',
    name: 'Slow Build',
    bpmRange: '60-80',
    bpm: 70,
    barLength: 3.4,
    cutsPerThirty: '3-5',
    maxWords: '8-10',
    feel: 'Emotional, cinematic.',
    bestFor: 'Deactivation stories, driver testimonials, "why I left" narratives.',
    songRec: 'Piano-driven, ambient, cinematic. Let the story breathe. Slow build to an emotional peak.',
    timingMap: `0:00-0:04 — HOOK: Emotional, cinematic. Long hold.
            Face shot with real emotion. Or: deactivation email on screen.
            No text overlay. Let the visual speak. Silence or soft music.

0:04-0:12 — STORY: 2 bars, long holds, intimate VO
            VO Line 1 (0:04-0:08): "[The moment everything changed]" — max 8 words
            VO Line 2 (0:08-0:12): "[What it felt like]" — max 8 words
            Minimal cuts. Hold on faces. Let emotion build.

0:12-0:22 — EMOTIONAL PEAK: Sync to swell or key change
            The transformation. "Then I found something different."
            Show: from fear/frustration -> empowerment/earnings.
            Music swells here. This is the catharsis moment.

0:22-0:28 — QUIET PROOF + SOFT CTA
            Earnings screenshot, gentle. "First week: $847."
            CTA: "Start here ->" — not aggressive. Invitational.

0:28-0:30 — LOOP: Fade or visual match. Soft close.`,
  },
];

// ============================================================
// PSYCHOLOGICAL FRAMEWORKS
// ============================================================

export const PSYCH_FRAMEWORKS: PsychFramework[] = [
  {
    id: 1,
    name: 'Loss Aversion',
    author: 'Kahneman & Tversky',
    badge: '1',
    principle: 'People are 2x more motivated to avoid losing $100 than to gain $100.',
    application: 'Every CTA frames inaction as loss, not the offer as gain. "Every ride you give Uber today, you\'re paying THEM to drive" hits harder than "Join HMU and earn more."',
    inContent: 'The Math Hook (#03) makes annual loss concrete: "$57,600/year going to Uber." Once anchored to that number, the viewer can\'t rationalize staying.',
    promptInstruction: 'CTA voiceover: Frame as the cost of NOT switching. Then provide a single, frictionless next step.',
  },
  {
    id: 2,
    name: 'In-Group Identification',
    author: 'Tajfel',
    badge: '2',
    principle: 'People adopt behaviors endorsed by their perceived in-group, especially when the in-group is defined by shared struggle.',
    application: 'HMU content uses language, visuals, and references that signal "I am one of you." Atlanta slang, car-interior shots, Uber driver screen recordings.',
    inContent: 'Never use stock footage of suits or offices. Always show: car interiors, phone screens, real streets, real earnings. The viewer must think "this person IS me."',
    promptInstruction: 'All visuals must match the driver\'s actual environment: car interior, phone dashboard, gas station, Atlanta streets.',
  },
  {
    id: 3,
    name: 'Zeigarnik Effect — Open Loops',
    author: 'Zeigarnik',
    badge: '3',
    principle: 'The brain compulsively seeks closure on incomplete information. Unfinished stories are remembered 90% better.',
    application: 'The Open Loop hook (#07) shows the result without the method. "$312 yesterday. Not Uber. Not Lyft." Drives re-watches — the #1 algorithm signal.',
    inContent: 'Never resolve the hook in the first 3 seconds. The loop should close at 20-25s, not before.',
    promptInstruction: 'Do not explain the hook\'s claim until after 0:15. The viewer must watch past the 5-second mark to understand the opening.',
  },
  {
    id: 4,
    name: 'Tempo-Emotion Synchrony',
    author: 'Juslin & Vastfjall',
    badge: '4',
    principle: 'Music BPM directly modulates heart rate and perceived urgency. This is physiological, not cognitive.',
    application: 'Earnings reveals use 128 BPM (energetic) — tempo creates felt urgency. Deactivation stories use 70 BPM (slow build) — tempo creates emotional space for empathy.',
    inContent: 'The song choice is NOT background music. It\'s the structural skeleton. Every cut, text reveal, and scene transition is beat-locked.',
    promptInstruction: 'All scene cuts on downbeats. Energy peak scene (proof/transformation) syncs to the track\'s drop or chorus.',
  },
  {
    id: 5,
    name: 'Pattern Interrupt',
    author: 'Cialdini',
    badge: '5',
    principle: 'The human visual system filters out predictable patterns and alerts on novelty. You have 300ms to break the scroll.',
    application: 'Every hook\'s first frame must look DIFFERENT from typical feed content. No logos, no "Hey guys!" Start with: a shocking number, a split screen, a deactivation email.',
    inContent: 'The first frame is the ad for the ad. If it looks like an ad, they scroll. If it looks like content a friend would post, they stop.',
    promptInstruction: 'Frame 0:00-0:01: No logo, no brand name, no product. High contrast, unexpected composition. Must break visual rhythm of social feed.',
  },
  {
    id: 6,
    name: 'Social Proof Cascade',
    author: 'Cialdini',
    badge: '6',
    principle: 'Trust forms faster when multiple proof types are stacked rapidly: a number, a face, a screenshot. Three weak proofs in 5s outperform one strong proof in 15s.',
    application: 'The Install Moment (18-25s) uses a rapid 3-shot cascade: earnings stat -> driver face -> app screenshot. Beat-locked, 2s each.',
    inContent: 'Never rely on a single proof point. Stack: "$847/week" + "real driver face" + "actual payout screenshot" in rapid succession.',
    promptInstruction: 'Scene 4 (Install Moment): Fast-cut sequence synced to drop — [stat] -> [face] -> [screenshot]. Each shot 1.5-2s. No explanation needed.',
  },
  {
    id: 7,
    name: 'Reactance Theory — The Hot Take Engine',
    author: 'Brehm',
    badge: '7',
    principle: 'When people feel their freedom is threatened, they push back. A polarizing statement triggers both agreement AND disagreement — both generate engagement.',
    application: 'The Hot Take hook (#08) makes a strong claim. Supporters share it. Critics comment. Both actions = distribution.',
    inContent: 'Use hot takes on Friday (Community Day) and pair with a constructive solution. The controversy gets reach; the solution gets conversions.',
    promptInstruction: 'Opening text: bold, polarizing statement. Hold 2s. Then cut to the supporting argument. Designed to generate comments.',
  },
  {
    id: 8,
    name: 'Seamless Loop = Algorithmic Amplification',
    author: 'Platform Algorithm Design',
    badge: '8',
    principle: 'TikTok and FB Reels weight re-watch rate as the strongest distribution signal. A seamless loop gets unconscious re-watches — each loop = 2x watch time signal.',
    application: 'Every video ends with a frame that visually matches the opening frame. The music loops cleanly. The viewer watches 2-3 loops before scrolling.',
    inContent: 'The Loop Check is non-negotiable. If the loop isn\'t clean, fix it before posting.',
    promptInstruction: 'Frame at 0:29 must visually match frame at 0:00. Audio must loop seamlessly. Test: does playing 0:28->0:02 feel continuous?',
  },
];

// ============================================================
// TREND TYPES
// ============================================================

export const TREND_TYPES: TrendType[] = [
  {
    id: 'sound',
    name: 'Trending Sound',
    badge: 'S',
    description: 'A specific song or audio clip going viral. Highest reach potential. Use the sound as-is and build your visual on top.',
    example: 'A trap beat with 50K+ uses this week',
    strategy: 'Use the trending sound as your audio track. Build visuals on top.',
    hookRec: 'Best hooks: #01 Receipt Reveal, #03 Math Hook, #07 Open Loop — these pair well with dramatic sound reveals.',
    velocity: 'Post within 3 days',
  },
  {
    id: 'format',
    name: 'Format / Template',
    badge: 'F',
    description: 'A recurring visual structure: "POV:", split screen, "Tell me X without telling me X", green screen, photo carousel trend.',
    example: '"Things that just make sense" + list format',
    strategy: 'Replicate the format exactly — then inject your content.',
    hookRec: 'Best hooks: #04 Group Callout, #05 Side-by-Side, #06 Driver Testimony — format trends reward recognizable structure with unexpected content.',
    velocity: 'Post within 1-2 weeks',
  },
  {
    id: 'news',
    name: 'News / Cultural Moment',
    badge: 'N',
    description: 'Breaking story, policy change, viral incident. Uber raises fees, a driver goes viral, gig worker legislation. Time-sensitive.',
    example: '"Uber just announced new fee structure"',
    strategy: 'Lead with the headline/screenshot. React. Then redirect to solution.',
    hookRec: 'Best hooks: #08 Hot Take, #01 Receipt Reveal — news moments need strong opinions and hard evidence.',
    velocity: 'POST WITHIN 24 HOURS',
  },
  {
    id: 'meme',
    name: 'Meme / Relatable',
    badge: 'M',
    description: 'A joke format, relatable observation, or reaction template. Lower effort, high share rate. Works great for FB groups.',
    example: '"Nobody: / Uber after taking 50% of the fare:" + reaction clip',
    strategy: 'Keep it short (15s max). Let humor carry. Put CTA in comments, not video.',
    hookRec: 'Best hooks: #05 Side-by-Side, #08 Hot Take — memes work best with contrast and bold statements.',
    velocity: 'Evergreen — bank and post anytime',
  },
];

// ============================================================
// CONTENT CALENDAR (7-day rotation)
// ============================================================

export const CONTENT_CALENDAR: CalendarDay[] = [
  {
    day: 'Monday',
    badge: 'red',
    theme: 'Pain Day — Receipt Reveal or Math Hook',
    segment: 'Frustrated Platform Driver',
    hook: '#01 Receipt Reveal or #03 Math Hook',
    tempo: 'Energetic (128 BPM)',
    content: 'Show the exploitation. Hard numbers. Rider receipt vs driver payout.',
    cta: '"Still paying Uber to use YOUR car? Link in bio."',
    goal: 'Outrage -> Share in FB groups',
  },
  {
    day: 'Tuesday',
    badge: 'green',
    theme: 'Solution Day — How It Works',
    segment: 'All segments',
    hook: '#04 Group Callout',
    tempo: 'Mid-tempo (100 BPM)',
    content: '30s walkthrough: Post HMU -> Get matched -> Money is held safe -> Drive -> Get paid 90%',
    cta: '"Your car. Your riders. Your money. Link in bio."',
    goal: 'Educate -> Sign up',
  },
  {
    day: 'Wednesday',
    badge: 'gold',
    theme: 'Proof Day — Earnings / Testimony',
    segment: 'Already Independent + Considering Starting',
    hook: '#06 Driver Testimony or #07 Open Loop',
    tempo: 'Mid-tempo (100 BPM)',
    content: 'Real earnings screenshot or driver story. "$847 first week, kept 90%."',
    cta: '"First 100 ATL drivers get 10% fees. Don\'t wait."',
    goal: 'Social proof -> Trust -> Sign up',
  },
  {
    day: 'Thursday',
    badge: 'blue',
    theme: 'Fear Day — Deactivation / Safety',
    segment: 'Frustrated Platform Driver',
    hook: '#02 Deactivation Story',
    tempo: 'Slow build (70 BPM)',
    content: 'Deactivation story arc. "1,847 rides. Gone overnight." Then: "Now I own my business."',
    cta: '"You\'re one email away from losing everything. Or you could own it. Link in bio."',
    goal: 'Fear -> Urgency -> Sign up',
  },
  {
    day: 'Friday',
    badge: 'purple',
    theme: 'Community Day — ATL Culture',
    segment: 'All segments (brand building)',
    hook: '#08 Hot Take or culture content',
    tempo: 'Energetic (128 BPM)',
    content: '"Built BY Atlanta, FOR Atlanta." Driver spotlight. Local landmarks. Community vibe.',
    cta: '"ATL drivers are switching. Don\'t be last."',
    goal: 'Brand affinity -> Shares -> Organic reach',
  },
  {
    day: 'Saturday',
    badge: 'orange',
    theme: 'Errand / Multi-Service Day',
    segment: 'Errand Runner / Multi-Service',
    hook: '#04 Group Callout (errand-specific)',
    tempo: 'Mid-tempo (100 BPM)',
    content: '"Not just rides. Grocery runs, airport pickups, weekly regulars." Show the flexibility.',
    cta: '"One app. All your services. Your prices. Link in bio."',
    goal: 'Expand perceived use cases -> Sign up',
  },
  {
    day: 'Sunday',
    badge: 'green',
    theme: 'Comparison Day — Side-by-Side',
    segment: 'Frustrated Platform Driver + Considering Starting',
    hook: '#05 Side-by-Side or #03 Math Hook',
    tempo: 'Energetic (128 BPM)',
    content: 'Weekly earnings comparison. "Uber: $600 gross, kept $380. HMU: $600 gross, kept $540."',
    cta: '"Do the math. Then do something about it. Link in bio."',
    goal: 'Set up Monday\'s pain content -> Weekly loop',
  },
];

// ============================================================
// CTA BANK
// ============================================================

export const CTA_BANK: CTACategory[] = [
  {
    name: 'Zero Friction',
    badge: 'green',
    ctas: [
      'Text HMU to [number]',
      'Link in bio — 30 seconds to sign up',
      'No background check. Start today.',
    ],
  },
  {
    name: 'Loss Frame',
    badge: 'gold',
    ctas: [
      'Every ride you give Uber is money you\'ll never see',
      'You drove 8 hours today. How much did YOU keep?',
      'Still paying Uber to use YOUR car?',
    ],
  },
  {
    name: 'Community',
    badge: 'blue',
    ctas: [
      'ATL drivers are switching. Don\'t be last.',
      'Built BY Atlanta drivers, FOR Atlanta drivers.',
      'Your car. Your riders. Your money.',
    ],
  },
  {
    name: 'Scarcity',
    badge: 'purple',
    ctas: [
      'First 100 drivers: 10% fees for life',
      'Your area needs drivers NOW',
      'Riders in [area] are waiting',
    ],
  },
];

// ============================================================
// ENERGY TO TEMPO MAPPING (for trend hijacks)
// ============================================================

export const ENERGY_LEVELS = [
  { id: 'high', label: 'High energy / hype', bpm: 128, tempo: 'Energetic', cuts: '8-12' },
  { id: 'confident', label: 'Confident / steady', bpm: 100, tempo: 'Mid-tempo', cuts: '5-7' },
  { id: 'emotional', label: 'Emotional / slow', bpm: 70, tempo: 'Slow build', cuts: '3-5' },
  { id: 'comedic', label: 'Comedic / absurd', bpm: 100, tempo: 'Mid-tempo (comedic timing)', cuts: '5-8' },
];

// ============================================================
// CONTENT FORMATS & PLATFORMS
// ============================================================

export const CONTENT_FORMATS = [
  'AI-generated (Gemini)',
  'Talking head / selfie',
  'Screen recording',
  'Mixed / B-roll',
];

export const PLATFORMS = ['TikTok', 'FB Reels', 'IG Reels', 'YouTube Shorts'];
