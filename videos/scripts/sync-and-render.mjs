#!/usr/bin/env node

/**
 * sync-and-render.mjs
 *
 * Pulls video configs from the local Next.js dev server (or production),
 * writes props JSON files, and renders each composition via Remotion CLI.
 *
 * Usage:
 *   node scripts/sync-and-render.mjs                    # render all active
 *   node scripts/sync-and-render.mjs RideFlow            # render one by composition ID
 *   API_URL=https://atl.hmucashride.com node scripts/sync-and-render.mjs  # use prod
 *
 * Prerequisites:
 *   1. Your Next.js dev server must be running (npm run dev in the main project)
 *   2. Screen recordings must be in videos/public/recordings/
 */

import { execSync } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API_URL = process.env.API_URL || "http://localhost:3000";
const filterComposition = process.argv[2]; // optional: render only this one

async function main() {
  console.log("\n🎬 HMU ATL Video Renderer");
  console.log(`   API: ${API_URL}`);
  console.log(`   Filter: ${filterComposition || "all active"}\n`);

  // 1. Fetch all video configs
  let configs;
  try {
    const res = await fetch(`${API_URL}/api/admin/videos`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    configs = await res.json();
  } catch (err) {
    console.error("❌ Failed to fetch configs. Is your dev server running?");
    console.error(`   Run: cd .. && npm run dev`);
    console.error(`   Error: ${err.message}`);
    process.exit(1);
  }

  // Filter
  if (filterComposition) {
    configs = configs.filter((c) => c.composition_id === filterComposition);
    if (!configs.length) {
      console.error(`❌ No config found for composition: ${filterComposition}`);
      console.error(`   Available: ${configs.map((c) => c.composition_id).join(", ")}`);
      process.exit(1);
    }
  } else {
    configs = configs.filter((c) => c.is_active);
  }

  console.log(`📋 Found ${configs.length} video(s) to render\n`);

  // 2. Create output and props directories
  mkdirSync(resolve(ROOT, "out"), { recursive: true });
  mkdirSync(resolve(ROOT, "props"), { recursive: true });

  // 3. Render each composition
  let successes = 0;
  let failures = 0;

  for (const config of configs) {
    const compositionId = config.composition_id;
    const outFile = compositionId
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .slice(1);

    // Check if recording exists
    const recordingPath = resolve(ROOT, "public/recordings", config.recording_file);
    if (!existsSync(recordingPath)) {
      console.warn(`⚠️  Skipping ${compositionId} — recording not found: ${config.recording_file}`);
      console.warn(`   Expected at: ${recordingPath}\n`);
      failures++;
      continue;
    }

    // Fetch props from the API
    let props;
    try {
      const propsRes = await fetch(`${API_URL}/api/admin/videos/${config.id}/props`);
      props = await propsRes.json();
    } catch (err) {
      console.error(`❌ Failed to fetch props for ${compositionId}: ${err.message}`);
      failures++;
      continue;
    }

    // Write props to file (Remotion reads from file)
    const propsFile = resolve(ROOT, "props", `${compositionId}.json`);
    writeFileSync(propsFile, JSON.stringify(props, null, 2));

    // Calculate total duration in frames
    const fps = 30;
    const totalFrames = Math.round(
      (Number(config.intro_sec) + Number(config.video_sec) + Number(config.end_sec)) * fps
    );

    console.log(`🎬 Rendering ${compositionId}...`);
    console.log(`   Recording: ${config.recording_file}`);
    console.log(`   Duration:  ${totalFrames} frames (${(totalFrames / fps).toFixed(1)}s)`);
    console.log(`   Steps:     ${config.steps.length}`);
    console.log(`   Output:    out/${outFile}.mp4`);

    try {
      execSync(
        `npx remotion render src/index.ts ${compositionId} out/${outFile}.mp4 --props props/${compositionId}.json`,
        { stdio: "inherit", cwd: ROOT }
      );
      console.log(`   ✅ Done: out/${outFile}.mp4\n`);
      successes++;
    } catch (e) {
      console.error(`   ❌ Failed: ${compositionId}\n`);
      failures++;
    }
  }

  console.log(`\n🏁 Complete: ${successes} rendered, ${failures} failed`);
  if (successes > 0) {
    console.log(`\n📁 Output files in: ${resolve(ROOT, "out")}`);
    console.log("   Upload to Data Room or copy to public/pitch/ for the demo page.");
  }
}

main();
