import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Logo } from "./Logo";

/**
 * End card with logo, tagline, and CTA.
 */
interface EndCardProps {
  tagline?: string;
  cta?: string;
}

export const EndCard: React.FC<EndCardProps> = ({
  tagline = "Your city. Your ride. Your rules.",
  cta = "Download HMU ATL",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textSpring = spring({
    frame: Math.max(0, frame - 15),
    fps,
    config: { damping: 15 },
  });

  const ctaSpring = spring({
    frame: Math.max(0, frame - 30),
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
        gap: 40,
      }}
    >
      {/* Glow background */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,230,118,0.08) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      <Logo size="large" showText />

      {/* Tagline */}
      <div
        style={{
          fontFamily: '"DM Sans", sans-serif',
          fontSize: 36,
          color: "#bbbbbb",
          textAlign: "center",
          maxWidth: 700,
          opacity: interpolate(textSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(textSpring, [0, 1], [20, 0])}px)`,
        }}
      >
        {tagline}
      </div>

      {/* CTA button */}
      <div
        style={{
          fontFamily: '"DM Sans", sans-serif',
          fontSize: 32,
          fontWeight: 600,
          color: "#080808",
          backgroundColor: "#00e676",
          paddingInline: 48,
          paddingBlock: 18,
          borderRadius: 100,
          opacity: interpolate(ctaSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(ctaSpring, [0, 1], [20, 0])}px)`,
        }}
      >
        {cta}
      </div>
    </AbsoluteFill>
  );
};
