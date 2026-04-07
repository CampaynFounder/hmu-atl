import { Composition } from "remotion";
import { DriverProfileCreation } from "./compositions/DriverProfileCreation";

// Placeholder compositions — uncomment when recordings are ready
// import { DriverOnboarding } from "./compositions/DriverOnboarding";
// import { PassengerBooking } from "./compositions/PassengerBooking";
// import { RideExperience } from "./compositions/RideExperience";
// import { InRideAddOns } from "./compositions/InRideAddOns";
// import { ChatBooking } from "./compositions/ChatBooking";
// import { DriverEarnings } from "./compositions/DriverEarnings";

// 9:16 vertical (1080x1920) at 30fps
const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;
const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DriverProfileCreation"
        component={DriverProfileCreation}
        durationInFrames={156 * FPS}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: "Create Your Driver Profile",
        }}
      />
    </>
  );
};
