import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

/**
 * PhoneFrame wraps a screen recording or screenshot in a phone bezel.
 * Place recordings in /public/recordings/ and screenshots in /public/screenshots/.
 *
 * Props:
 *  - src: filename in /public/recordings/ (video) or /public/screenshots/ (image)
 *  - type: "video" | "image"
 *  - enterFrom: optional slide-in direction
 */
interface PhoneFrameProps {
  src: string;
  type: "video" | "image";
  enterFrom?: "bottom" | "right" | "left" | "none";
  startFrom?: number; // for videos — start from this second
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  src,
  type,
  enterFrom = "bottom",
  startFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance animation
  const enterProgress = spring({ frame, fps, config: { damping: 15 } });

  const translateY =
    enterFrom === "bottom"
      ? interpolate(enterProgress, [0, 1], [200, 0])
      : 0;
  const translateX =
    enterFrom === "right"
      ? interpolate(enterProgress, [0, 1], [300, 0])
      : enterFrom === "left"
        ? interpolate(enterProgress, [0, 1], [-300, 0])
        : 0;
  const opacity = interpolate(enterProgress, [0, 1], [0, 1]);

  const mediaPath = type === "video"
    ? staticFile(`recordings/${src}`)
    : staticFile(`screenshots/${src}`);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        transform: enterFrom !== "none"
          ? `translate(${translateX}px, ${translateY}px)`
          : undefined,
        opacity: enterFrom !== "none" ? opacity : 1,
      }}
    >
      {/* Phone bezel */}
      <div
        style={{
          width: 380,
          height: 820,
          borderRadius: 48,
          border: "4px solid rgba(255,255,255,0.15)",
          overflow: "hidden",
          backgroundColor: "#080808",
          boxShadow: "0 0 60px rgba(0,230,118,0.1), 0 20px 60px rgba(0,0,0,0.5)",
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
            backgroundColor: "#080808",
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            zIndex: 10,
          }}
        />

        {/* Screen content */}
        <div
          style={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
          }}
        >
          {type === "video" ? (
            <OffthreadVideo
              src={mediaPath}
              startFrom={startFrom * fps}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <Img
              src={mediaPath}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
