import React from "react";
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Sequence,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
  spring,
  Img,
  OffthreadVideo,
  staticFile,
} from "remotion";
import { adjustedSec, computeRecordingFrame, computeAudioSegments, totalVideoFrames } from "../lib/timing";
import "../styles.css";

/**
 * VIDEO: Ride Flow — Pickup to Drop-off
 * Continuous screen recording with timestamp-based overlay labels.
 *
 * User enters raw recording timestamps. Timing adjustments (title card
 * shifts + video freeze) are handled by shared helpers in lib/timing.ts.
 *
 * Place your recording in /public/recordings/ride-flow.mp4
 */

type FlyEffect =
  | "slide-up-bounce"
  | "slide-right-pulse"
  | "scale-blur"
  | "slide-left-parallax"
  | "rotate-pulse"
  | "slide-right-bounce"
  | "zoom-glow";

export interface RideFlowStep {
  sec: number;
  label: string;
  caption: string;
  effect: FlyEffect;
}

const DEFAULT_STEPS: RideFlowStep[] = [
  { sec: 2, label: "BOOKING CONFIRMED", caption: "Your ride is locked in. Driver's about to move.", effect: "slide-up-bounce" },
  { sec: 15, label: "OTW", caption: "They tapped OTW. Track them in real time.", effect: "slide-right-pulse" },
  { sec: 30, label: "HERE", caption: "They're here. Head to the car.", effect: "scale-blur" },
  { sec: 42, label: "BET", caption: "You tapped BET. Ride's active.", effect: "zoom-glow" },
  { sec: 55, label: "RIDE ACTIVE", caption: "Live map, live tracking. You're moving.", effect: "slide-left-parallax" },
  { sec: 75, label: "DROP OFF", caption: "You made it. Ride's wrapping up.", effect: "rotate-pulse" },
  { sec: 88, label: "END RIDE", caption: "See what you paid, what your driver kept. All transparent.", effect: "slide-right-bounce" },
  { sec: 100, label: "RATE YOUR DRIVER", caption: "Keep it real. CHILL, Cool AF, or let us know.", effect: "slide-up-bounce" },
];

interface RideFlowProps {
  title?: string;
  steps?: RideFlowStep[];
  recordingFile?: string;
  introSec?: number;
  videoSec?: number;
  endSec?: number;
  titleCardDurationSec?: number;
  captionDurationSec?: number;
  endTagline?: string;
  endCta?: string;
  phoneWidth?: number;
  phoneHeight?: number;
  muted?: boolean;
}

// ── Main composition ──

export const RideFlow: React.FC<RideFlowProps> = ({
  title = "THE RIDE",
  steps = DEFAULT_STEPS,
  recordingFile = "ride-flow.mp4",
  introSec = 3,
  videoSec = 115,
  endSec = 5,
  titleCardDurationSec = 2,
  captionDurationSec = 5,
  endTagline = "Your city. Your ride. Your rules.",
  endCta = "HMU ATL",
  phoneWidth = 480,
  phoneHeight = 1036,
  muted = false,
}) => {
  const { fps } = useVideoConfig();

  const INTRO_F = Math.round(introSec * fps);
  const VIDEO_F = totalVideoFrames(videoSec, steps.length, titleCardDurationSec, fps);
  const END_F = Math.round(endSec * fps);
  const TITLE_F = Math.round(titleCardDurationSec * fps);
  const CAPTION_F = Math.round(captionDurationSec * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#080808" }}>
      {/* Layer 1: Logo intro */}
      <Sequence from={0} durationInFrames={INTRO_F}>
        <LogoIntro title={title} />
      </Sequence>

      {/* Audio track — segmented to stay in sync with frozen video during title cards */}
      {!muted && (() => {
        const segments = computeAudioSegments(fps, steps, titleCardDurationSec, videoSec);
        return segments.map((seg, i) => (
          <Sequence key={`audio-${i}`} from={INTRO_F + seg.compositionStartFrame} durationInFrames={seg.durationFrames}>
            <Audio src={staticFile(`recordings/${recordingFile}`)} startFrom={seg.recordingStartFrame} />
          </Sequence>
        ));
      })()}

      {/* Layer 2: Continuous video in phone frame */}
      <Sequence from={INTRO_F} durationInFrames={VIDEO_F}>
        <AbsoluteFill>
          {/* Green glow behind phone */}
          <div
            style={{
              position: "absolute",
              top: "35%",
              left: "50%",
              width: 500,
              height: 500,
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(circle, rgba(0,230,118,0.08) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* Phone with recording (freezes during title cards) */}
          <PhoneWithEffects
            steps={steps}
            titleCardDurationSec={titleCardDurationSec}
            recordingFile={recordingFile}
            phoneWidth={phoneWidth}
            phoneHeight={phoneHeight}
            muted={muted}
          />

          {/* Progress bar at top */}
          <ProgressBar
            steps={steps}
            titleCardDurationSec={titleCardDurationSec}
          />

          {/* Layer 3: Title card overlays at adjusted timestamps */}
          {steps.map((step, i) => {
            const overlayFrom = Math.round(adjustedSec(i, step.sec, titleCardDurationSec) * fps);
            return (
              <Sequence
                key={i}
                from={overlayFrom}
                durationInFrames={TITLE_F}
                layout="none"
              >
                <TitleCardOverlay
                  step={String(i + 1).padStart(2, "0")}
                  label={step.label}
                  totalSteps={steps.length}
                />
              </Sequence>
            );
          })}

          {/* Layer 4: Caption overlays (appear after title card fades) */}
          {steps.map((step, i) => {
            const captionFrom = Math.round(
              (adjustedSec(i, step.sec, titleCardDurationSec) + titleCardDurationSec) * fps
            );
            return (
              <Sequence
                key={`cap-${i}`}
                from={captionFrom}
                durationInFrames={CAPTION_F}
                layout="none"
              >
                <CaptionOverlay
                  text={step.caption}
                  enterFrom={
                    step.effect === "slide-left-parallax" ? "right" : "bottom"
                  }
                />
              </Sequence>
            );
          })}
        </AbsoluteFill>
      </Sequence>

      {/* Layer 5: End card */}
      <Sequence from={INTRO_F + VIDEO_F} durationInFrames={END_F}>
        <EndCardInline tagline={endTagline} cta={endCta} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ── Phone with fly-in effects + frozen video during title cards ──
const PhoneWithEffects: React.FC<{
  steps: RideFlowStep[];
  titleCardDurationSec: number;
  recordingFile: string;
  phoneWidth: number;
  phoneHeight: number;
  muted?: boolean;
}> = ({ steps, titleCardDurationSec, recordingFile, phoneWidth, phoneHeight, muted = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentSec = frame / fps;

  // Compute which recording frame to display (freezes during title cards)
  const recordingFrame = computeRecordingFrame(frame, fps, steps, titleCardDurationSec);

  // Find which step we're in using adjusted times
  let activeEffect: FlyEffect = "slide-up-bounce";
  let transitionProgress = 1;
  let borderGlow = 0;

  for (let i = steps.length - 1; i >= 0; i--) {
    const stepStart = adjustedSec(i, steps[i].sec, titleCardDurationSec);
    const titleEnd = stepStart + titleCardDurationSec;
    if (currentSec >= stepStart) {
      activeEffect = steps[i].effect;
      if (currentSec < titleEnd) {
        transitionProgress = 0;
      } else {
        const flyInSec = currentSec - titleEnd;
        const flySpring = spring({
          frame: Math.round(flyInSec * fps),
          fps,
          config: { damping: 13, stiffness: 180 },
        });
        transitionProgress = flySpring;
      }
      break;
    }
  }

  let translateX = 0;
  let translateY = 0;
  let scale = 1;
  let rotate = 0;
  let blur = 0;

  switch (activeEffect) {
    case "slide-up-bounce":
      translateY = interpolate(transitionProgress, [0, 1], [350, 0]);
      scale = interpolate(transitionProgress, [0, 1], [0.9, 1]);
      break;
    case "slide-right-pulse":
      translateX = interpolate(transitionProgress, [0, 1], [450, 0]);
      borderGlow = interpolate(transitionProgress, [0.5, 1], [0.6, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      break;
    case "scale-blur":
      scale = interpolate(transitionProgress, [0, 1], [0.7, 1]);
      blur = interpolate(transitionProgress, [0, 0.8], [12, 0], {
        extrapolateRight: "clamp",
      });
      break;
    case "slide-left-parallax":
      translateX = interpolate(transitionProgress, [0, 1], [-450, 0]);
      break;
    case "rotate-pulse":
      rotate = interpolate(transitionProgress, [0, 1], [-8, 0]);
      scale = interpolate(transitionProgress, [0, 1], [0.85, 1]);
      borderGlow = interpolate(transitionProgress, [0.3, 0.8], [0.5, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      break;
    case "slide-right-bounce":
      translateX = interpolate(transitionProgress, [0, 1], [400, 0]);
      scale = interpolate(transitionProgress, [0, 1], [0.92, 1]);
      break;
    case "zoom-glow":
      scale = interpolate(transitionProgress, [0, 1], [1.15, 1]);
      borderGlow = interpolate(transitionProgress, [0, 0.6], [0.8, 0], {
        extrapolateRight: "clamp",
      });
      break;
  }

  const opacity = interpolate(transitionProgress, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  const glowColor = `rgba(0,230,118,${0.1 + borderGlow * 0.5})`;
  const glowShadow =
    borderGlow > 0
      ? `0 0 ${40 + borderGlow * 60}px ${glowColor}, 0 0 ${60 + borderGlow * 40}px rgba(0,230,118,${borderGlow * 0.3}), 0 20px 60px rgba(0,0,0,0.5)`
      : "0 0 60px rgba(0,230,118,0.1), 0 20px 60px rgba(0,0,0,0.5)";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotate}deg)`,
        opacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        willChange: "transform, opacity, filter",
      }}
    >
      <div
        style={{
          width: phoneWidth,
          height: phoneHeight,
          borderRadius: phoneWidth >= 1080 ? 0 : 48,
          border: phoneWidth >= 1080 ? "none" : `4px solid rgba(255,255,255,${0.15 + borderGlow * 0.3})`,
          overflow: "hidden",
          backgroundColor: "#000000",
          boxShadow: phoneWidth >= 1080 ? "none" : glowShadow,
          position: "relative",
        }}
      >
        {/* Notch — hidden in borderless mode */}
        {phoneWidth < 1080 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: 150,
              height: 34,
              backgroundColor: "#000000",
              borderBottomLeftRadius: 20,
              borderBottomRightRadius: 20,
              zIndex: 10,
            }}
          />
        )}
        <div
          style={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000000",
          }}
        >
          {/* Freeze the video at the computed recording frame */}
          <Freeze frame={recordingFrame}>
            <OffthreadVideo
              src={staticFile(`recordings/${recordingFile}`)}
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: phoneWidth >= 1080 ? "cover" : "contain",
              }}
            />
          </Freeze>
        </div>
      </div>
    </div>
  );
};

// ── Title card overlay ──
const TitleCardOverlay: React.FC<{
  step: string;
  label: string;
  totalSteps: number;
}> = ({ step, label, totalSteps }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  const fadeIn = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const opacity = fadeIn * fadeOut;

  const scale = interpolate(enterSpring, [0, 1], [0.85, 1]);
  const lineWidth = interpolate(enterSpring, [0, 1], [0, 200]);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        opacity,
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(8,8,8,0.85)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          width: 500,
          height: 500,
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(circle, rgba(0,230,118,${0.2 * enterSpring}) 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          fontFamily: '"Space Mono", monospace',
          fontSize: 26,
          color: "#00E676",
          letterSpacing: 6,
          opacity: 0.8,
          transform: `scale(${scale})`,
          zIndex: 1,
        }}
      >
        STEP {step} OF {String(totalSteps).padStart(2, "0")}
      </div>
      <div
        style={{
          width: lineWidth,
          height: 3,
          backgroundColor: "#00E676",
          borderRadius: 2,
          boxShadow: "0 0 12px rgba(0,230,118,0.5)",
          zIndex: 1,
        }}
      />
      <div
        style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: 72,
          color: "#FFFFFF",
          letterSpacing: 6,
          transform: `scale(${scale})`,
          textAlign: "center",
          zIndex: 1,
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};

// ── Caption overlay ──
const CaptionOverlay: React.FC<{
  text: string;
  enterFrom?: "bottom" | "right";
}> = ({ text, enterFrom = "bottom" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 15 },
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const opacity = interpolate(enterSpring, [0, 1], [0, 1]) * fadeOut;
  const translateY =
    enterFrom === "bottom"
      ? interpolate(enterSpring, [0, 1], [30, 0])
      : 0;
  const translateX =
    enterFrom === "right"
      ? interpolate(enterSpring, [0, 1], [80, 0])
      : 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 90,
        left: 50,
        right: 50,
        display: "flex",
        justifyContent: "center",
        opacity,
        transform: `translate(${translateX}px, ${translateY}px)`,
        zIndex: 15,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(8,8,8,0.75)",
          backdropFilter: "blur(8px)",
          padding: "14px 28px",
          borderRadius: 16,
          border: "1px solid rgba(0,230,118,0.15)",
        }}
      >
        <div
          style={{
            fontFamily: '"DM Sans", sans-serif',
            fontSize: 34,
            color: "#ffffff",
            textAlign: "center",
            maxWidth: 850,
            lineHeight: 1.4,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};

// ── Progress bar ──
const ProgressBar: React.FC<{
  steps: RideFlowStep[];
  titleCardDurationSec: number;
}> = ({ steps, titleCardDurationSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentSec = frame / fps;

  // Find current step using adjusted times
  let currentStep = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (currentSec >= adjustedSec(i, steps[i].sec, titleCardDurationSec)) {
      currentStep = i + 1;
      break;
    }
  }

  const progress = currentStep / steps.length;

  const barOpacity = interpolate(frame, [0, 30], [0, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 50,
        left: 50,
        right: 50,
        zIndex: 10,
        opacity: barOpacity,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: '"Space Mono", monospace',
          fontSize: 20,
          color: "#00E676",
          letterSpacing: 3,
          marginBottom: 8,
        }}
      >
        {currentStep > 0
          ? `${String(currentStep).padStart(2, "0")}/${String(steps.length).padStart(2, "0")}`
          : ""}
      </div>
      <div
        style={{
          height: 2,
          backgroundColor: "rgba(255,255,255,0.1)",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            backgroundColor: "#00E676",
            borderRadius: 1,
            boxShadow: "0 0 8px rgba(0,230,118,0.4)",
          }}
        />
      </div>
    </div>
  );
};

// ── Logo intro ──
const LogoIntro: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scaleSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });
  const scale = interpolate(scaleSpring, [0, 1], [0.5, 1]);
  const opacity = interpolate(scaleSpring, [0, 1], [0, 1]);

  const fadeOut = interpolate(frame, [70, 90], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleSpring = spring({
    frame: Math.max(0, frame - 12),
    fps,
    config: { damping: 15 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#080808",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "35%",
          left: "50%",
          width: 600,
          height: 600,
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(0,230,118,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 0 40px rgba(0,230,118,0.25)",
          }}
        >
          <Img
            src={staticFile("icon.svg")}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
        <div
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 64,
            color: "#ffffff",
            letterSpacing: 4,
          }}
        >
          HMU ATL
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 50,
          right: 50,
          display: "flex",
          justifyContent: "center",
          opacity: interpolate(titleSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(titleSpring, [0, 1], [20, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 56,
            color: "#00E676",
            letterSpacing: 4,
            textAlign: "center",
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── End card ──
const EndCardInline: React.FC<{ tagline: string; cta: string }> = ({
  tagline,
  cta,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 12 } });
  const taglineSpring = spring({
    frame: Math.max(0, frame - 15),
    fps,
    config: { damping: 12 },
  });
  const ctaSpring = spring({
    frame: Math.max(0, frame - 30),
    fps,
    config: { damping: 12 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#080808",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 36,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "35%",
          left: "50%",
          width: 600,
          height: 600,
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(0,230,118,0.15) 0%, transparent 70%)",
        }}
      />
      <div
        style={{
          opacity: logoSpring,
          transform: `scale(${interpolate(logoSpring, [0, 1], [0.5, 1])})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 0 40px rgba(0,230,118,0.25)",
          }}
        >
          <Img
            src={staticFile("icon.svg")}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
        <div
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 48,
            color: "#fff",
            letterSpacing: 3,
          }}
        >
          HMU ATL
        </div>
      </div>
      <div
        style={{
          fontFamily: '"DM Sans", sans-serif',
          fontSize: 36,
          color: "#888",
          textAlign: "center",
          opacity: taglineSpring,
          transform: `translateY(${interpolate(taglineSpring, [0, 1], [20, 0])}px)`,
        }}
      >
        {tagline}
      </div>
      <div
        style={{
          fontFamily: '"DM Sans", sans-serif',
          fontSize: 32,
          fontWeight: 700,
          color: "#080808",
          backgroundColor: "#00E676",
          padding: "16px 48px",
          borderRadius: 16,
          opacity: ctaSpring,
          transform: `translateY(${interpolate(ctaSpring, [0, 1], [20, 0])}px)`,
          boxShadow: "0 0 30px rgba(0,230,118,0.3)",
        }}
      >
        {cta}
      </div>
    </AbsoluteFill>
  );
};
