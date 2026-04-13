import { Composition } from "remotion";
import { DriverProfileCreation } from "./compositions/DriverProfileCreation";
import { RideFlow } from "./compositions/RideFlow";

// 9:16 vertical (1080x1920) at 30fps
const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;
const FPS = 30;

// Duration = intro + recording + (numSteps * titleCardDuration) + end
// DriverProfileCreation: 3 + 148 + (7 * 2) + 5 = 170s
// RideFlow: 3 + 115 + (8 * 2) + 5 = 139s

const compositions = [
  {
    id: "DriverProfileCreation",
    component: DriverProfileCreation,
    durationInFrames: 170 * FPS,
    defaultProps: { title: "Create Your Driver Profile" },
  },
  {
    id: "RideFlow",
    component: RideFlow,
    durationInFrames: 139 * FPS,
    defaultProps: { title: "THE RIDE" },
  },
];

// REMOTION_COMPOSITION env var controls which composition loads first in Studio.
// Set by: npm run video -- preview RideFlow
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
