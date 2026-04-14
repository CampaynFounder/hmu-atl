import { Composition } from "remotion";
import { RideFlow } from "./compositions/RideFlow";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";

// 9:16 vertical (1080x1920) at 30fps
const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;
const FPS = 30;

/**
 * Default props shape — used when no props file exists.
 * Every field must be declared here so Remotion allows --props overrides.
 */
const DEFAULT_PROPS = {
  title: "HMU VIDEO",
  steps: [
    { sec: 2, label: "STEP ONE", caption: "Description here.", effect: "slide-up-bounce" as const },
  ],
  recordingFile: "recording.mp4",
  introSec: 3,
  videoSec: 60,
  endSec: 5,
  titleCardDurationSec: 2,
  captionDurationSec: 5,
  endTagline: "Your city. Your ride. Your rules.",
  endCta: "HMU ATL",
  phoneWidth: 480,
  phoneHeight: 1036,
  muted: false,
};

/**
 * Dynamically register compositions from props/ directory.
 *
 * Workflow:
 *   1. Admin creates video config in portal (custom Composition ID + recording + steps)
 *   2. Run: npm run video -- preview MyVideo
 *   3. CLI fetches config from Neon, writes props/MyVideo.json
 *   4. Root.tsx reads that file, registers "MyVideo" as a Composition
 *   5. Remotion renders it using the RideFlow template with those props
 *
 * All compositions use the same RideFlow component — the props make each unique.
 * No code changes needed to add new videos.
 */
function loadDynamicCompositions(): { id: string; props: typeof DEFAULT_PROPS; duration: number }[] {
  const compositions: { id: string; props: typeof DEFAULT_PROPS; duration: number }[] = [];

  try {
    const propsDir = resolve(__dirname, "..", "props");
    const files = readdirSync(propsDir).filter(f => f.endsWith(".json"));

    for (const file of files) {
      try {
        const id = file.replace(/\.json$/, "");
        const raw = JSON.parse(readFileSync(resolve(propsDir, file), "utf-8"));
        const props = { ...DEFAULT_PROPS, ...raw };

        // Calculate duration from props
        const stepCards = (props.steps?.length || 0) * (props.titleCardDurationSec || 2);
        const totalSec = (props.introSec || 3) + (props.videoSec || 60) + stepCards + (props.endSec || 5);

        compositions.push({ id, props, duration: Math.ceil(totalSec) });
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // props/ directory doesn't exist yet — that's fine
  }

  return compositions;
}

// Load from props files
const dynamic = loadDynamicCompositions();

// IDs already loaded from files
const dynamicIds = new Set(dynamic.map(c => c.id));

// Hardcoded fallbacks for compositions that might not have props files yet
const FALLBACKS = [
  { id: "DriverProfileCreation", duration: 170, props: { ...DEFAULT_PROPS, title: "CREATE YOUR DRIVER PROFILE", recordingFile: "driversignup.mov", videoSec: 148 } },
  { id: "RideFlow", duration: 139, props: { ...DEFAULT_PROPS, title: "THE RIDE", recordingFile: "ride-flow.mp4", videoSec: 115 } },
];

// Merge: dynamic props files take priority, fallbacks fill gaps
const all = [
  ...dynamic,
  ...FALLBACKS.filter(f => !dynamicIds.has(f.id)),
];

// REMOTION_COMPOSITION env var controls which composition loads first in Studio.
const preferred = process.env.REMOTION_COMPOSITION;
const sorted = preferred
  ? [...all].sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0))
  : all;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {sorted.map((comp) => (
        <Composition
          key={comp.id}
          id={comp.id}
          component={RideFlow}
          durationInFrames={comp.duration * FPS}
          fps={FPS}
          width={VERTICAL_WIDTH}
          height={VERTICAL_HEIGHT}
          defaultProps={comp.props}
        />
      ))}
    </>
  );
};
