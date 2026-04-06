import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  staticFile,
} from "remotion";

/**
 * HMU ATL logo with entrance animation.
 * Uses the SVG icon + "HMU ATL" text in Bebas Neue.
 */
interface LogoProps {
  size?: "small" | "large";
  showText?: boolean;
  delay?: number;
}

export const Logo: React.FC<LogoProps> = ({
  size = "large",
  showText = true,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const adjustedFrame = Math.max(0, frame - delay);
  const scaleSpring = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const scale = interpolate(scaleSpring, [0, 1], [0.5, 1]);
  const opacity = interpolate(scaleSpring, [0, 1], [0, 1]);

  const iconSize = size === "large" ? 120 : 60;

  if (frame < delay) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: size === "large" ? 20 : 10,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 0 40px rgba(0,230,118,0.2)",
        }}
      >
        <Img
          src={staticFile("icon.svg")}
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* Text */}
      {showText && (
        <div
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: size === "large" ? 64 : 32,
            color: "#ffffff",
            letterSpacing: 4,
          }}
        >
          HMU ATL
        </div>
      )}
    </div>
  );
};
