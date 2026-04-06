import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Scene } from "../components/Scene";
import { PhoneFrame } from "../components/PhoneFrame";
import { TextOverlay } from "../components/TextOverlay";
import { EndCard } from "../components/EndCard";
import { GreenGlow } from "../components/GreenGlow";
import "../styles.css";

/**
 * VIDEO 4: In-Ride Add-Ons & Services — "More Than a Ride"
 * Duration: 35s @ 30fps = 1050 frames
 *
 * SCREEN RECORDINGS NEEDED (place in /public/recordings/):
 *   - addons-driver-menu-setup.mp4    (driver setting up their service menu)
 *   - addons-rider-browse.mp4         (rider browsing add-ons during active ride)
 *   - addons-tap-confirm.mp4          (tapping add-on → confirmation with price)
 *   - addons-ride-total.mp4           (ride total updating with add-on line items)
 *   - addons-driver-earnings.mp4      (driver earnings showing add-on revenue)
 */

export const InRideAddOns: React.FC<{ title: string }> = ({ title }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#080808" }}>
      {/* Scene 1: Driver menu setup (0:00–0:06) */}
      <Sequence from={0} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="addons-driver-menu-setup.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Drivers on HMU aren't just drivers. They set up their own service menu."
            position="bottom"
            variant="caption"
            delay={10}
          />
        </Scene>
      </Sequence>

      {/* Scene 2: Rider browsing add-ons mid-ride (0:06–0:12) */}
      <Sequence from={6 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="addons-rider-browse.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="Mid-ride, you can browse what your driver offers. Extra stops, services, whatever they bring to the table."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 3: Tap → confirm with price (0:12–0:18) */}
      <Sequence from={12 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow intensity={0.1} />
          <PhoneFrame
            src="addons-tap-confirm.mp4"
            type="video"
            enterFrom="left"
          />
          <TextOverlay
            text="Tap it, see the price, confirm. It's added to your ride total automatically."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 4: Ride total breakdown (0:18–0:24) */}
      <Sequence from={18 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="addons-ride-total.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Full breakdown. Ride cost. Add-ons. No hidden fees. You see everything."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 5: Driver earnings from add-ons (0:24–0:30) */}
      <Sequence from={24 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="addons-driver-earnings.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="Drivers keep more when they offer more. Add-ons are extra income, same ride."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 6: End card (0:30–0:35) */}
      <Sequence from={30 * fps} durationInFrames={5 * fps}>
        <EndCard
          tagline="More than a ride."
          cta="HMU ATL"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
