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

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DriverProfileCreation"
        component={DriverProfileCreation}
        durationInFrames={170 * FPS}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: "Create Your Driver Profile",
        }}
      />
      <Composition
        id="RideFlow"
        component={RideFlow}
        durationInFrames={139 * FPS}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: "THE RIDE",
        }}
      />
    </>
  );
};
