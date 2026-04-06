import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Scene } from "../components/Scene";
import { PhoneFrame } from "../components/PhoneFrame";
import { TextOverlay } from "../components/TextOverlay";
import { EndCard } from "../components/EndCard";
import { GreenGlow } from "../components/GreenGlow";
import "../styles.css";

/**
 * VIDEO 3: The Ride Experience — "OTW to Done"
 * Duration: 50s @ 30fps = 1500 frames
 *
 * SCREEN RECORDINGS NEEDED (place in /public/recordings/):
 *   - ride-otw-map.mp4          (driver taps OTW → rider map tracking)
 *   - ride-here-notify.mp4      (HERE status → rider notification)
 *   - ride-bet-active.mp4       (rider taps BET → ride goes active)
 *   - ride-active-map.mp4       (live map, chat, ETA during ride)
 *   - ride-addons-menu.mp4      (browsing add-ons, adding a stop mid-ride)
 *   - ride-addon-confirm.mp4    (add-on confirmation + price update)
 *   - ride-end.mp4              (driver taps End Ride → completion screen)
 *   - ride-rating.mp4           (rating screen with CHILL / Cool AF)
 */

export const RideExperience: React.FC<{ title: string }> = ({ title }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#080808" }}>
      {/* Scene 1: OTW + map tracking (0:00–0:06) */}
      <Sequence from={0} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="ride-otw-map.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Your driver tapped OTW. You can track them in real time on the map."
            position="bottom"
            variant="caption"
            delay={10}
          />
        </Scene>
      </Sequence>

      {/* Scene 2: HERE arrival (0:06–0:12) */}
      <Sequence from={6 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="ride-here-notify.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="They're HERE. You'll get the notification. Head to the car."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 3: BET → ride active (0:12–0:17) */}
      <Sequence from={12 * fps} durationInFrames={5 * fps}>
        <Scene durationInFrames={5 * fps}>
          <GreenGlow intensity={0.1} />
          <PhoneFrame
            src="ride-bet-active.mp4"
            type="video"
            enterFrom="left"
          />
          <TextOverlay
            text="Tap BET. You're in. Ride's active."
            position="bottom"
            variant="headline"
            delay={6}
          />
        </Scene>
      </Sequence>

      {/* Scene 4: Active ride — map + chat (0:17–0:24) */}
      <Sequence from={17 * fps} durationInFrames={7 * fps}>
        <Scene durationInFrames={7 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="ride-active-map.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Live map shows your route. Need to talk? Chat's right there."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 5: Add-ons mid-ride (0:24–0:32) — KEY DIFFERENTIATOR */}
      <Sequence from={24 * fps} durationInFrames={8 * fps}>
        <Scene durationInFrames={8 * fps}>
          <GreenGlow intensity={0.12} />
          <PhoneFrame
            src="ride-addons-menu.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="This is where it gets different."
            position="top"
            variant="headline"
            delay={6}
          />
          <TextOverlay
            text="Your driver has a menu. Need a stop? Add it. They offer services? Book it mid-ride."
            position="bottom"
            variant="caption"
            delay={20}
          />
        </Scene>
      </Sequence>

      {/* Scene 6: Add-on price confirm (0:32–0:38) */}
      <Sequence from={32 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="ride-addon-confirm.mp4"
            type="video"
            enterFrom="left"
          />
          <TextOverlay
            text="Everything's transparent. You see the add-on price before you confirm."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 7: End Ride (0:38–0:44) */}
      <Sequence from={38 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="ride-end.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Ride's done. You see exactly what you paid and what your driver kept."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 8: Rating → end card (0:44–0:50) */}
      <Sequence from={44 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="ride-rating.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="Rate your driver. Keep it real. CHILL, Cool AF, or let us know if something was off."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>
    </AbsoluteFill>
  );
};
