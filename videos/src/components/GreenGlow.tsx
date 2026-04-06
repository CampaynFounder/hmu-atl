import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

/**
 * Animated green glow background effect — subtle pulse.
 */
export const GreenGlow: React.FC<{ intensity?: number }> = ({
  intensity = 0.08,
}) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(
    Math.sin(frame * 0.03),
    [-1, 1],
    [intensity * 0.6, intensity]
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse at 50% 30%, rgba(0,230,118,${pulse}) 0%, transparent 60%)`,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
};
