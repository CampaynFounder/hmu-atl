import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

/**
 * Animated text overlay — used for voiceover captions and callouts.
 * Positioned at top or bottom of the frame.
 */
interface TextOverlayProps {
  text: string;
  position?: "top" | "bottom" | "center";
  variant?: "caption" | "headline" | "callout" | "label";
  delay?: number; // frames before appearing
}

const STYLES = {
  caption: {
    fontFamily: '"DM Sans", sans-serif',
    fontSize: 36,
    fontWeight: 500,
    lineHeight: 1.4,
    color: "#ffffff",
    maxWidth: 900,
  },
  headline: {
    fontFamily: '"Bebas Neue", sans-serif',
    fontSize: 72,
    fontWeight: 400,
    lineHeight: 1.1,
    color: "#00e676",
    maxWidth: 900,
    letterSpacing: 2,
  },
  callout: {
    fontFamily: '"Space Mono", monospace',
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.3,
    color: "#00e676",
    maxWidth: 800,
    textTransform: "uppercase" as const,
  },
  label: {
    fontFamily: '"DM Sans", sans-serif',
    fontSize: 28,
    fontWeight: 400,
    lineHeight: 1.4,
    color: "#bbbbbb",
    maxWidth: 800,
  },
};

const POSITIONS = {
  top: { top: 120, left: 0, right: 0, paddingInline: 60 },
  bottom: { bottom: 160, left: 0, right: 0, paddingInline: 60 },
  center: {
    top: "50%",
    left: 0,
    right: 0,
    transform: "translateY(-50%)",
    paddingInline: 60,
  },
};

export const TextOverlay: React.FC<TextOverlayProps> = ({
  text,
  position = "bottom",
  variant = "caption",
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const adjustedFrame = Math.max(0, frame - delay);

  const enterProgress = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 18, stiffness: 120 },
  });

  const opacity = interpolate(enterProgress, [0, 1], [0, 1]);
  const translateY = interpolate(enterProgress, [0, 1], [30, 0]);

  if (frame < delay) return null;

  return (
    <div
      style={{
        position: "absolute",
        ...POSITIONS[position],
        display: "flex",
        justifyContent: "center",
        zIndex: 20,
      }}
    >
      <div
        style={{
          ...STYLES[variant],
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: "center",
          textShadow: "0 2px 20px rgba(0,0,0,0.8)",
        }}
      >
        {text}
      </div>
    </div>
  );
};
