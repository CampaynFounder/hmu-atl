import React from "react";
import {
  AbsoluteFill,
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
import "../styles.css";

/**
 * VIDEO: Driver Profile Creation — Full walkthrough with overlay transitions
 * Source: driver-profile-creation.mp4 (163s @ 576x960)
 *
 * TIMESTAMP HANDLING:
 * User enters timestamps from the raw recording. Each title card inserts
 * TITLE_CARD_DURATION_SEC of dead time. The composition auto-adjusts:
 *   - Overlay positions shift forward by cumulative title card time
 *   - Recording freezes during title cards via <Freeze>
 *   - Total duration grows by (numSteps * titleCardDurationSec)
 *
 * Timestamps (seconds into recording):
 *   2.28   → Driver Details
 *   25.22  → Car Details
 *   61.02  → Profile Video
 *   99.23  → Rider Preferences
 *   128.24 → Ratings Details / Location ETA
 *   136.21 → Profile Created
 */

type FlyEffect = "slide-up-bounce" | "slide-right-pulse" | "scale-blur" | "slide-left-parallax" | "rotate-pulse" | "slide-right-bounce" | "zoom-glow";

const STEPS: Array<{
  sec: number;
  label: string;
  caption: string;
  effect: FlyEffect;
}> = [
  { sec: 0.28, label: "DRIVER DETAILS", caption: "Tell us who you are. Name, number, the basics.", effect: "slide-up-bounce" },
  { sec: 22.22, label: "CAR DETAILS", caption: "Your whip, your plate. Riders want to know what they're getting into.", effect: "slide-right-pulse" },
  { sec: 57.02, label: "PROFILE VIDEO", caption: "Five seconds. Let riders see the real you.", effect: "scale-blur" },
  { sec: 94.73, label: "RIDER PREFERENCES", caption: "Set your rules. Your ride, your terms.", effect: "slide-left-parallax" },
  { sec: 125.24, label: "HOW RATINGS WORK", caption: "Riders rate you after every ride. Stay chill, stay booked.", effect: "rotate-pulse" },
  { sec: 133.68, label: "LOCATION & ETA", caption: "Pick your zones and set your availability.", effect: "slide-right-bounce" },
  { sec: 138.51, label: "PROFILE CREATED", caption: "You're set. Time to go live.", effect: "zoom-glow" },
];

const INTRO_SEC = 3;
const VIDEO_SEC = 148;
const END_SEC = 5;

const TITLE_CARD_DURATION_SEC = 2; // how long each title card shows
const CAPTION_DURATION_SEC = 5; // how long each caption lingers

/** Adjusted composition time for step i (each previous title card pushes it forward). */
function adjustedSec(stepIndex: number, rawSec: number): number {
  return rawSec + stepIndex * TITLE_CARD_DURATION_SEC;
}

/** Maps composition frame → recording frame. Freezes during title cards. */
function computeRecordingFrame(
  compositionFrame: number,
  fps: number,
  steps: { sec: number }[],
): number {
  const compSec = compositionFrame / fps;
  let pauseAccum = 0;
  for (let i = 0; i < steps.length; i++) {
    const cardStart = steps[i].sec + i * TITLE_CARD_DURATION_SEC;
    const cardEnd = cardStart + TITLE_CARD_DURATION_SEC;
    if (compSec < cardStart) break;
    if (compSec < cardEnd) return Math.round(steps[i].sec * fps);
    pauseAccum += TITLE_CARD_DURATION_SEC;
  }
  return Math.round((compSec - pauseAccum) * fps);
}

// ── Main composition ──
export const DriverProfileCreation: React.FC<{ title: string }> = () => {
  const { fps } = useVideoConfig();

  const INTRO_F = Math.round(INTRO_SEC * fps);
  // Video section includes time for all title card pauses
  const VIDEO_F = Math.round((VIDEO_SEC + STEPS.length * TITLE_CARD_DURATION_SEC) * fps);
  const END_F = Math.round(END_SEC * fps);
  const TITLE_F = Math.round(TITLE_CARD_DURATION_SEC * fps);
  const CAPTION_F = Math.round(CAPTION_DURATION_SEC * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#080808" }}>
      {/* Layer 1: Logo intro */}
      <Sequence from={0} durationInFrames={INTRO_F}>
        <LogoIntro />
      </Sequence>

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

          {/* Phone playing continuously */}
          <PhoneWithEffects steps={STEPS} titleCardDurationSec={TITLE_CARD_DURATION_SEC} />

          {/* Progress bar at top */}
          <ProgressBar steps={STEPS} />

          {/* Layer 3: Title card overlays at adjusted timestamps */}
          {STEPS.map((step, i) => {
            const overlayFrom = Math.round(adjustedSec(i, step.sec) * fps);
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
                  totalSteps={STEPS.length}
                />
              </Sequence>
            );
          })}

          {/* Layer 4: Caption overlays (appear after title card fades) */}
          {STEPS.map((step, i) => {
            const captionFrom = Math.round((adjustedSec(i, step.sec) + TITLE_CARD_DURATION_SEC) * fps);
            return (
              <Sequence
                key={`cap-${i}`}
                from={captionFrom}
                durationInFrames={CAPTION_F}
                layout="none"
              >
                <CaptionOverlay text={step.caption} enterFrom={step.effect === "slide-left-parallax" ? "right" : "bottom"} />
              </Sequence>
            );
          })}
        </AbsoluteFill>
      </Sequence>

      {/* Layer 5: End card */}
      <Sequence from={INTRO_F + VIDEO_F} durationInFrames={END_F}>
        <EndCardInline />
      </Sequence>
    </AbsoluteFill>
  );
};

// ── Phone with fly-in effects per step ──
const PhoneWithEffects: React.FC<{
  steps: typeof STEPS;
  titleCardDurationSec: number;
}> = ({ steps, titleCardDurationSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentSec = frame / fps;

  // Compute which recording frame to display (freezes during title cards)
  const recordingFrame = computeRecordingFrame(frame, fps, steps);

  // Find which step we're in using adjusted times
  let activeEffect: FlyEffect = "slide-up-bounce";
  let transitionProgress = 1; // 1 = fully settled
  let borderGlow = 0;

  for (let i = steps.length - 1; i >= 0; i--) {
    const stepStart = adjustedSec(i, steps[i].sec);
    const titleEnd = stepStart + titleCardDurationSec;
    if (currentSec >= stepStart) {
      activeEffect = steps[i].effect;
      // During title card: phone is "away" (progress=0)
      // After title card: phone flies in (0→1 over ~0.7s)
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

  // Compute transform based on effect type
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
      borderGlow = interpolate(transitionProgress, [0.5, 1], [0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      break;
    case "scale-blur":
      scale = interpolate(transitionProgress, [0, 1], [0.7, 1]);
      blur = interpolate(transitionProgress, [0, 0.8], [12, 0], { extrapolateRight: "clamp" });
      break;
    case "slide-left-parallax":
      translateX = interpolate(transitionProgress, [0, 1], [-450, 0]);
      break;
    case "rotate-pulse":
      rotate = interpolate(transitionProgress, [0, 1], [-8, 0]);
      scale = interpolate(transitionProgress, [0, 1], [0.85, 1]);
      borderGlow = interpolate(transitionProgress, [0.3, 0.8], [0.5, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      break;
    case "slide-right-bounce":
      translateX = interpolate(transitionProgress, [0, 1], [400, 0]);
      scale = interpolate(transitionProgress, [0, 1], [0.92, 1]);
      break;
    case "zoom-glow":
      scale = interpolate(transitionProgress, [0, 1], [1.15, 1]);
      borderGlow = interpolate(transitionProgress, [0, 0.6], [0.8, 0], { extrapolateRight: "clamp" });
      break;
  }

  const opacity = interpolate(transitionProgress, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Green border glow intensity
  const glowColor = `rgba(0,230,118,${0.1 + borderGlow * 0.5})`;
  const glowShadow = borderGlow > 0
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
          width: 380,
          height: 820,
          borderRadius: 48,
          border: `4px solid rgba(255,255,255,${0.15 + borderGlow * 0.3})`,
          overflow: "hidden",
          backgroundColor: "#000000",
          boxShadow: glowShadow,
          position: "relative",
        }}
      >
        {/* Notch */}
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
          <Freeze frame={recordingFrame}>
            <OffthreadVideo
              src={staticFile("recordings/driversignup.mov")}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </Freeze>
        </div>
      </div>
    </div>
  );
};

// ── Title card overlay (appears on top of phone) ──
const TitleCardOverlay: React.FC<{
  step: string;
  label: string;
  totalSteps: number;
}> = ({ step, label, totalSteps }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enterSpring = spring({ frame, fps, config: { damping: 12, stiffness: 200 } });

  // Fade in fast, hold, fade out
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
      {/* Dark scrim behind title */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(8,8,8,0.85)",
        }}
      />

      {/* Glow */}
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

      {/* Step number */}
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

      {/* Green line */}
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

      {/* Label */}
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

// ── Caption overlay (bottom of screen, over phone) ──
const CaptionOverlay: React.FC<{ text: string; enterFrom?: "bottom" | "right" }> = ({ text, enterFrom = "bottom" }) => {
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
  const translateY = enterFrom === "bottom" ? interpolate(enterSpring, [0, 1], [30, 0]) : 0;
  const translateX = enterFrom === "right" ? interpolate(enterSpring, [0, 1], [80, 0]) : 0;

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
  steps: typeof STEPS;
}> = ({ steps }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentSec = frame / fps;

  // Find current step using adjusted times
  let currentStep = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (currentSec >= adjustedSec(i, steps[i].sec)) {
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
      {/* Step counter */}
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

      {/* Bar track */}
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
const LogoIntro: React.FC = () => {
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
          CREATE YOUR DRIVER PROFILE
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── End card ──
const EndCardInline: React.FC = () => {
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
        You're live. Atlanta's waiting.
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
        START DRIVING
      </div>
    </AbsoluteFill>
  );
};
