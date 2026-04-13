import { Composition } from "remotion";
import { DriverProfileCreation } from "./compositions/DriverProfileCreation";
import { RideFlow } from "./compositions/RideFlow";

// 9:16 vertical (1080x1920) at 30fps
const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;
const FPS = 30;

/**
 * Full defaultProps for each composition.
 * Remotion needs the complete prop shape here so --props from CLI
 * can properly override them. Without this, input props get ignored.
 */
const compositions = [
  {
    id: "DriverProfileCreation",
    component: DriverProfileCreation,
    durationInFrames: 170 * FPS,
    defaultProps: {
      title: "CREATE YOUR DRIVER PROFILE",
      steps: [
        { sec: 0.28, label: "DRIVER DETAILS", caption: "Tell us who you are. Name, number, the basics.", effect: "slide-up-bounce" as const },
        { sec: 22.22, label: "CAR DETAILS", caption: "Your whip, your plate. Riders want to know what they're getting into.", effect: "slide-right-pulse" as const },
        { sec: 57.02, label: "PROFILE VIDEO", caption: "Five seconds. Let riders see the real you.", effect: "scale-blur" as const },
        { sec: 94.73, label: "RIDER PREFERENCES", caption: "Set your rules. Your ride, your terms.", effect: "slide-left-parallax" as const },
        { sec: 125.24, label: "HOW RATINGS WORK", caption: "Riders rate you after every ride. Stay chill, stay booked.", effect: "rotate-pulse" as const },
        { sec: 133.68, label: "LOCATION & ETA", caption: "Pick your zones and set your availability.", effect: "slide-right-bounce" as const },
        { sec: 138.51, label: "PROFILE CREATED", caption: "You're set. Time to go live.", effect: "zoom-glow" as const },
      ],
      recordingFile: "driversignup.mov",
      introSec: 3,
      videoSec: 148,
      endSec: 5,
      titleCardDurationSec: 2,
      captionDurationSec: 5,
      endTagline: "You're live. Atlanta's waiting.",
      endCta: "START DRIVING",
      phoneWidth: 480,
      phoneHeight: 1036,
    },
  },
  {
    id: "RideFlow",
    component: RideFlow,
    durationInFrames: 139 * FPS,
    defaultProps: {
      title: "THE RIDE",
      steps: [
        { sec: 2, label: "BOOKING CONFIRMED", caption: "Your ride is locked in. Driver's about to move.", effect: "slide-up-bounce" as const },
        { sec: 15, label: "OTW", caption: "They tapped OTW. Track them in real time.", effect: "slide-right-pulse" as const },
        { sec: 30, label: "HERE", caption: "They're here. Head to the car.", effect: "scale-blur" as const },
        { sec: 42, label: "BET", caption: "You tapped BET. Ride's active.", effect: "zoom-glow" as const },
        { sec: 55, label: "RIDE ACTIVE", caption: "Live map, live tracking. You're moving.", effect: "slide-left-parallax" as const },
        { sec: 75, label: "DROP OFF", caption: "You made it. Ride's wrapping up.", effect: "rotate-pulse" as const },
        { sec: 88, label: "END RIDE", caption: "See what you paid, what your driver kept. All transparent.", effect: "slide-right-bounce" as const },
        { sec: 100, label: "RATE YOUR DRIVER", caption: "Keep it real. CHILL, Cool AF, or let us know.", effect: "slide-up-bounce" as const },
      ],
      recordingFile: "ride-flow.mp4",
      introSec: 3,
      videoSec: 115,
      endSec: 5,
      titleCardDurationSec: 2,
      captionDurationSec: 5,
      endTagline: "Your city. Your ride. Your rules.",
      endCta: "HMU ATL",
      phoneWidth: 480,
      phoneHeight: 1036,
    },
  },
];

// REMOTION_COMPOSITION env var controls which composition loads first in Studio.
const preferred = process.env.REMOTION_COMPOSITION;
const sorted = preferred
  ? [...compositions].sort((a, b) =>
      a.id === preferred ? -1 : b.id === preferred ? 1 : 0
    )
  : compositions;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {sorted.map((comp) => (
        <Composition
          key={comp.id}
          id={comp.id}
          component={comp.component}
          durationInFrames={comp.durationInFrames}
          fps={FPS}
          width={VERTICAL_WIDTH}
          height={VERTICAL_HEIGHT}
          defaultProps={comp.defaultProps}
        />
      ))}
    </>
  );
};
