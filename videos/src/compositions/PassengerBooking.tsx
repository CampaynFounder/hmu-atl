import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Scene } from "../components/Scene";
import { PhoneFrame } from "../components/PhoneFrame";
import { TextOverlay } from "../components/TextOverlay";
import { EndCard } from "../components/EndCard";
import { GreenGlow } from "../components/GreenGlow";
import "../styles.css";

/**
 * VIDEO 2: Passenger Booking — "Find Your Ride"
 * Duration: 40s @ 30fps = 1200 frames
 *
 * SCREEN RECORDINGS NEEDED (place in /public/recordings/):
 *   - rider-feed-browse.mp4           (home feed with available drivers)
 *   - rider-browse-filter.mp4         (swiping/filtering drivers by area, price)
 *   - rider-driver-profile.mp4        (driver profile with video, vehicle, menu)
 *   - rider-post-request.mp4          (posting ride request with pickup/dropoff)
 *   - rider-match-chat.mp4            (match notification → chat opens)
 *   - rider-chat-details.mp4          (chat interface, quick messages, negotiation)
 *   - rider-coo-confirm.mp4           (COO tap, payment confirmation)
 */

export const PassengerBooking: React.FC<{ title: string }> = ({ title }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#080808" }}>
      {/* Scene 1: Feed with available drivers (0:00–0:05) */}
      <Sequence from={0} durationInFrames={5 * fps}>
        <Scene durationInFrames={5 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="rider-feed-browse.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Need a ride? HMU ATL connects you with real drivers in your area."
            position="bottom"
            variant="caption"
            delay={10}
          />
        </Scene>
      </Sequence>

      {/* Scene 2: Browsing and filtering (0:05–0:12) */}
      <Sequence from={5 * fps} durationInFrames={7 * fps}>
        <Scene durationInFrames={7 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="rider-browse-filter.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="Browse who's live right now. See their price, their vibe, their chill score."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 3: Driver profile deep-dive (0:12–0:18) */}
      <Sequence from={12 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="rider-driver-profile.mp4"
            type="video"
            enterFrom="left"
          />
          <TextOverlay
            text="Tap in. Watch their intro. Check their ride history."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 4: Post ride request (0:18–0:24) */}
      <Sequence from={18 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="rider-post-request.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Post your request — where you're at, where you're going, what you'll pay."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 5: Match + chat opens (0:24–0:30) */}
      <Sequence from={24 * fps} durationInFrames={6 * fps}>
        <Scene durationInFrames={6 * fps}>
          <GreenGlow intensity={0.1} />
          <PhoneFrame
            src="rider-match-chat.mp4"
            type="video"
            enterFrom="right"
          />
          <TextOverlay
            text="When a driver says COO, you're matched. Chat opens instantly."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 6: Chat details (0:30–0:35) */}
      <Sequence from={30 * fps} durationInFrames={5 * fps}>
        <Scene durationInFrames={5 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="rider-chat-details.mp4"
            type="video"
            enterFrom="left"
          />
          <TextOverlay
            text="Work out the details right in the chat. No guessing, no surprises."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>

      {/* Scene 7: COO payment confirm → end (0:35–0:40) */}
      <Sequence from={35 * fps} durationInFrames={5 * fps}>
        <Scene durationInFrames={5 * fps}>
          <GreenGlow />
          <PhoneFrame
            src="rider-coo-confirm.mp4"
            type="video"
            enterFrom="bottom"
          />
          <TextOverlay
            text="Tap COO, funds are held, and your driver's on the way."
            position="bottom"
            variant="caption"
            delay={8}
          />
        </Scene>
      </Sequence>
    </AbsoluteFill>
  );
};
