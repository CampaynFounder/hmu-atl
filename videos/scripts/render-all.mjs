import { execSync } from "child_process";
import { mkdirSync } from "fs";

const compositions = [
  "DriverProfileCreation",
  "RideFlow",
  "DriverOnboarding",
  "PassengerBooking",
  "RideExperience",
  "InRideAddOns",
  "ChatBooking",
  "DriverEarnings",
];

mkdirSync("out", { recursive: true });

for (const comp of compositions) {
  const outFile = comp.replace(/([A-Z])/g, "-$1").toLowerCase().slice(1);
  console.log(`\n🎬 Rendering ${comp}...`);
  try {
    execSync(
      `npx remotion render src/index.ts ${comp} out/${outFile}.mp4`,
      { stdio: "inherit" }
    );
    console.log(`  Done: out/${outFile}.mp4`);
  } catch (e) {
    console.error(`  Failed: ${comp}`);
  }
}

console.log("\nAll renders complete.");
