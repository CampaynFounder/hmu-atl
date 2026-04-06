import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Scene } from "../components/Scene";
import { PhoneFrame } from "../components/PhoneFrame";
import { TextOverlay } from "../components/TextOverlay";
import { EndCard } from "../components/EndCard";
import { GreenGlow } from "../components/GreenGlow";
import "../styles.css";

/**
 * VIDEO 5: Chat Booking — "Talk First, Ride After"
 * Duration: 30s @ 30fps = 900 frames
 *
 * SCREEN RECORDINGS NEEDED (place in /public/recordings/):
 *   - chat-share-link.mp4         (driver public profile link being shared/opened)
 *   - chat-driver-profile.mp4     (opening link → driver profile with Book button)
 *   - chat-messaging.mp4          (chat interface with quick messages flying)
 *   - chat-negotiate.mp4          (price negotiation in chat)
 *   - chat-confirm-otw.mp4        (COO confirmation → OTW)
 */

export const ChatBooking: React.FC<{ title: string }> = ({ title }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#080808" }}>
      {/* Scene 1: Share driver link (0:00–0:06) */}
      <Sequence from={0} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="chat-share-link.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Every driver has a link. Share it anywhere — text, IG, wherever."
            position="bottom"
            variant="caption"
            delay={10}
          />
        </Scene>
      </Sequence>

      {/* Scene 2: Open profile → Book (0:06–0:12) */}
      <Sequence from={6 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="chat-driver-profile.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="Tap it, see their profile, and book direct. No feed, no searching."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 3: Chat quick messages (0:12–0:18) */}
      <Sequence from={12 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow intensity={0.1} />
          <PhoneFrame
            src="chat-messaging.mp4"
            type="video"
            enterFrom="left"
          />
          <TextOverlay
            text="Once matched, the chat is your planning space. Quick messages make it easy."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 4: Price negotiation (0:18–0:24) */}
      <Sequence from={18 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="chat-negotiate.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Work out the price, the pickup spot, the vibe. All before the ride starts."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 5: Confirm → OTW → end (0:24–0:30) */}
      <Sequence from={24 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="chat-confirm-otw.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="Agree on everything, tap COO, and they're on the way. That's how you HMU."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>
    </AbsoluteFill>
  );
};
