import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Scene } from "../components/Scene";
import { PhoneFrame } from "../components/PhoneFrame";
import { TextOverlay } from "../components/TextOverlay";
import { EndCard } from "../components/EndCard";
import { GreenGlow } from "../components/GreenGlow";
import "../styles.css";

/**
 * VIDEO 6: Driver Earnings — "Keep Your Bag"
 * Duration: 40s @ 30fps = 1200 frames
 *
 * SCREEN RECORDINGS NEEDED (place in /public/recordings/):
 *   - earnings-dashboard.mp4        (driver earnings dashboard overview)
 *   - earnings-ride-breakdown.mp4   (single ride "You kept / HMU took" breakdown)
 *   - earnings-cap-hit.mp4          (daily cap hitting → $0 fee celebration)
 *   - earnings-hmu-first.mp4        (HMU First upgrade screen)
 *   - earnings-cashout.mp4          (cashout flow → bank/debit selection)
 *   - earnings-weekly.mp4           (weekly earnings summary)
 */

export const DriverEarnings: React.FC<{ title: string }> = ({ title }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#080808" }}>
      {/* Scene 1: Earnings dashboard (0:00–0:06) */}
      <Sequence from={0} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="earnings-dashboard.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Every dollar. Every ride. You see it all."
            position="bottom"
            variant="caption"
            delay={10}
          />
        </Scene>
      </Sequence>

      {/* Scene 2: Ride fee breakdown (0:06–0:12) */}
      <Sequence from={6 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="earnings-ride-breakdown.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="After every ride, two numbers. What you kept, what HMU took. That's it."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 3: Daily cap hit — VIRAL MOMENT (0:12–0:18) */}
      <Sequence from={12 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow intensity={0.15} />
          <PhoneFrame
            src="earnings-cap-hit.mp4"
            type="video"
            enterFrom="left"
          />
          <TextOverlay
            text="Hit the daily cap? The rest of the day is ALL yours. Zero fees."
            position="top"
            variant="headline"
            delay={6}
          />
        </Scene>
      </Sequence>

      {/* Scene 4: HMU First upgrade (0:18–0:24) */}
      <Sequence from={18 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="earnings-hmu-first.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Go HMU First for nine ninety-nine a month. Twelve percent flat. Lower caps. Instant cashout."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 5: Cashout flow (0:24–0:32) */}
      <Sequence from={24 * fps} durationInFrames={8 * fps}>
        <Scene durationInFrames={8 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="earnings-cashout.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="Cash out whenever you want. Bank or debit card. Your money, your schedule."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 6: Weekly summary → end card (0:32–0:40) */}
      <Sequence from={32 * fps} durationInFrames={8 * fps}>
        <Scene durationInFrames={4 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="earnings-weekly.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="No waiting for Friday. No minimum balance. You drove, you earned, you cash out."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      <Sequence from={36 * fps} durationInFrames={4 * fps}>
        <EndCard
          tagline="Your hustle. Your money."
          cta="HMU"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
