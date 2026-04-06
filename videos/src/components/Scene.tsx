import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";

/**
 * Scene wraps content with fade transitions and timing.
 * Use inside a <Sequence> or directly — handles its own fade in/out.
 */
interface SceneProps {
  children: React.ReactNode;
  backgroundColor?: string;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  durationInFrames: number;
}

export const Scene: React.FC<SceneProps> = ({
  children,
  backgroundColor = "#080808",
  fadeInDuration = 8,
  fadeOutDuration = 8,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, fadeInDuration, durationInFrames - fadeOutDuration, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
