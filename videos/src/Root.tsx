import { Composition } from "remotion";
import { DriverOnboarding } from "./compositions/DriverOnboarding";
import { PassengerBooking } from "./compositions/PassengerBooking";
import { RideExperience } from "./compositions/RideExperience";
import { InRideAddOns } from "./compositions/InRideAddOns";
import { ChatBooking } from "./compositions/ChatBooking";
import { DriverEarnings } from "./compositions/DriverEarnings";

// 9:16 vertical (1080x1920) at 30fps
const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;
const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DriverOnboarding"
        component={DriverOnboarding}
        durationInFrames={45 * FPS}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: "Start Earning on HMU",
        }}
      />
      <Composition
        id="PassengerBooking"
        component={PassengerBooking}
        durationInFrames={40 * FPS}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: "Find Your Ride",
        }}
      />
      <Composition
        id="RideExperience"
        component={RideExperience}
        durationInFrames={50 * FPS}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: "OTW to Done",
        }}
      />
      <Composition
        id="InRideAddOns"
        component={InRideAddOns}
        durationInFrames={35 * FPS}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: "More Than a Ride",
        }}
      />
      <Composition
        id="ChatBooking"
        component={ChatBooking}
        durationInFrames={30 * FPS}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: "Talk First, Ride After",
        }}
      />
      <Composition
        id="DriverEarnings"
        component={DriverEarnings}
        durationInFrames={40 * FPS}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: "Keep Your Bag",
        }}
      />
    </>
  );
};
