import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Scene } from "../components/Scene";
import { PhoneFrame } from "../components/PhoneFrame";
import { TextOverlay } from "../components/TextOverlay";
import { Logo } from "../components/Logo";
import { EndCard } from "../components/EndCard";
import { GreenGlow } from "../components/GreenGlow";
import "../styles.css";

/**
 * VIDEO 1: Driver Onboarding — "Start Earning on HMU"
 * Duration: 45s @ 30fps = 1350 frames
 *
 * SCREEN RECORDINGS NEEDED (place in /public/recordings/):
 *   - driver-onboarding-welcome.mp4      (tapping Drive → welcome screen)
 *   - driver-onboarding-profile.mp4      (filling in name, pronouns, phone)
 *   - driver-onboarding-vehicle.mp4      (vehicle info, plate, photo)
 *   - driver-onboarding-video-intro.mp4  (recording 5-second video intro)
 *   - driver-onboarding-areas.mp4        (setting areas, pricing, schedule)
 *   - driver-onboarding-payout.mp4       (Stripe Connect payout setup)
 *   - driver-onboarding-golive.mp4       (dashboard with Go Live button)
 *
 * SCREENSHOT FALLBACKS (place in /public/screenshots/):
 *   - driver-onboarding-welcome.png
 *   - driver-onboarding-profile.png
 *   - etc.
 */

export const DriverOnboarding: React.FC<{ title: string }> = ({ title }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#080808" }}>
      {/* Scene 1: Logo intro (0:00–0:05 = frames 0–150) */}
      <Sequence from={0} durationInFrames={5 * fps}>
        <Scene durationInFrames={5 * fps}>
          <GreenGlow intensity={0.12} />
          <Logo size="large" showText />
          <TextOverlay
            text="You drive. You set the price. You keep the bag."
            position="bottom"
            variant="caption"
            delay={15}
          />
        </Scene>
      </Sequence>

      {/* Scene 2: Tap Drive → onboarding (0:05–0:12 = frames 150–360) */}
      <Sequence from={5 * fps} durationInFrames={7 * fps}>
        <Scene durationInFrames={7 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="driver-onboarding-welcome.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Getting started takes two minutes. Tap Drive, and tell us who you are."
            position="bottom"
            variant="caption"
            delay={10}
          />
        </Scene>
      </Sequence>

      {/* Scene 3: Profile info (0:12–0:18 = frames 360–540) */}
      <Sequence from={12 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="driver-onboarding-profile.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="Add your name, your number, and how you want to show up."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 4: Vehicle info (0:18–0:25 = frames 540–750) */}
      <Sequence from={18 * fps} durationInFrames={7 * fps}>
        <Scene durationInFrames={7 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="driver-onboarding-vehicle.mp4"
            type="video"
            enterFrom="left"
          />
          <TextOverlay
            text="Drop your vehicle info. Riders want to know what they're getting into."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 5: Video intro recording (0:25–0:32 = frames 750–960) */}
      <Sequence from={25 * fps} durationInFrames={7 * fps}>
        <Scene durationInFrames={7 * fps}>
          <GreenGlow intensity={0.1} />
          <PhoneFrame
            src="driver-onboarding-video-intro.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Record a quick intro. Five seconds. Let riders see the real you."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 6: Areas, pricing, schedule (0:32–0:38 = frames 960–1140) */}
      <Sequence from={32 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="driver-onboarding-areas.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="Pick your zones, set your minimum, and choose your hours."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 7: Payout setup (0:38–0:42 = frames 1140–1260) */}
      <Sequence from={38 * fps} durationInFrames={4 * fps}>
        <Scene durationInFrames={4 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="driver-onboarding-payout.mp4"
            type="video"
            enterFrom="left"
          />
          <TextOverlay
            text="Link your bank or debit card. That's where the money goes."
            position="bottom"
            variant="caption"
            delay={6}
          />
        </Scene>
      </Sequence>

      {/* Scene 8: Go Live end card (0:42–0:45 = frames 1260–1350) */}
      <Sequence from={42 * fps} durationInFrames={3 * fps}>
        <EndCard
          tagline="You're live. Atlanta's waiting."
          cta="HMU"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
