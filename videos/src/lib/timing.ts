/**
 * Shared timing helpers for Remotion compositions.
 *
 * User-entered timestamps reference the raw recording.
 * Title card overlays insert dead time into the composition timeline.
 * These helpers adjust positions and compute which recording frame
 * to display so timestamps stay accurate regardless of how many
 * title cards are inserted.
 *
 * Usage in a composition:
 *   import { adjustedSec, computeRecordingFrame } from "../lib/timing";
 */

/**
 * Returns the adjusted composition time for step `stepIndex`.
 * Each previous step's title card pushes this step forward in the timeline.
 *
 * @param stepIndex  - Zero-based index of the step
 * @param rawSec    - The user-entered timestamp (seconds into raw recording)
 * @param titleDur  - Duration of each title card overlay in seconds
 */
export function adjustedSec(
  stepIndex: number,
  rawSec: number,
  titleDur: number,
): number {
  return rawSec + stepIndex * titleDur;
}

/**
 * Maps a composition frame to the recording frame that should be displayed.
 * During title card overlays, the recording freezes at the step's timestamp.
 * Between title cards, the recording plays at 1:1 speed.
 *
 * Wrap your <OffthreadVideo> in <Freeze frame={computeRecordingFrame(...)}>
 * to keep the video in sync with the user's timestamps.
 *
 * @param compositionFrame - Current frame within the video section Sequence
 * @param fps             - Frames per second
 * @param steps           - Array of steps with { sec } (raw recording timestamps)
 * @param titleDur        - Duration of each title card overlay in seconds
 */
export function computeRecordingFrame(
  compositionFrame: number,
  fps: number,
  steps: { sec: number }[],
  titleDur: number,
): number {
  const compSec = compositionFrame / fps;
  let pauseAccum = 0;

  for (let i = 0; i < steps.length; i++) {
    const cardStart = steps[i].sec + i * titleDur;
    const cardEnd = cardStart + titleDur;

    if (compSec < cardStart) break;
    if (compSec < cardEnd) return Math.round(steps[i].sec * fps);
    pauseAccum += titleDur;
  }

  return Math.round((compSec - pauseAccum) * fps);
}

/**
 * Compute audio segments that stay in sync with the frozen video.
 * Each segment plays a slice of the recording audio between title cards.
 * During title cards, audio is silent (no segment covers that time).
 *
 * Returns array of { compositionStartFrame, durationFrames, recordingStartFrame }
 * to use as: <Audio startFrom={recordingStartFrame} /> inside
 *            <Sequence from={compositionStartFrame} durationInFrames={durationFrames}>
 */
export function computeAudioSegments(
  fps: number,
  steps: { sec: number }[],
  titleDur: number,
  totalRecordingSec: number,
): { compositionStartFrame: number; durationFrames: number; recordingStartFrame: number }[] {
  const segments: { compositionStartFrame: number; durationFrames: number; recordingStartFrame: number }[] = [];

  for (let i = 0; i <= steps.length; i++) {
    // Recording start = end of previous step's timestamp (or 0 for first segment)
    const recStart = i === 0 ? 0 : steps[i - 1].sec;
    // Recording end = this step's timestamp (or end of recording for last segment)
    const recEnd = i < steps.length ? steps[i].sec : totalRecordingSec;
    const recDuration = recEnd - recStart;
    if (recDuration <= 0) continue;

    // Composition start = recording start + accumulated title card time before this segment
    const compStart = recStart + i * titleDur;

    segments.push({
      compositionStartFrame: Math.round(compStart * fps),
      durationFrames: Math.round(recDuration * fps),
      recordingStartFrame: Math.round(recStart * fps),
    });
  }

  return segments;
}

/**
 * Computes total video section duration including title card pauses.
 * Use this for the video Sequence's durationInFrames and for Root.tsx.
 *
 * @param recordingSec - Duration of the raw recording in seconds
 * @param numSteps     - Number of steps (title cards)
 * @param titleDur     - Duration of each title card in seconds
 * @param fps          - Frames per second
 */
export function totalVideoFrames(
  recordingSec: number,
  numSteps: number,
  titleDur: number,
  fps: number,
): number {
  return Math.round((recordingSec + numSteps * titleDur) * fps);
}
