#!/usr/bin/env node

/**
 * video.mjs — One command to preview or render HMU ATL videos.
 *
 * Connects directly to Neon (no dev server needed), fetches the video
 * config, writes props, and runs Remotion.
 *
 * Usage:
 *   node scripts/video.mjs render RideFlow        # render to MP4
 *   node scripts/video.mjs preview RideFlow       # open Remotion Studio to this composition
 *   node scripts/video.mjs render                 # render all active videos
 *   node scripts/video.mjs list                   # show all video configs
 *
 * Shorthand from project root (via npm):
 *   npm run video -- render RideFlow
 *   npm run video -- preview RideFlow
 *   npm run video -- list
 */

import { execSync, spawn } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const VIDEOS_DIR = resolve(ROOT, "videos");

// ── Load .env.local ──
function loadEnv() {
  const envFile = resolve(ROOT, ".env.local");
  if (!existsSync(envFile)) {
    console.error("❌ .env.local not found. Copy .env.example and fill in DATABASE_URL.");
    process.exit(1);
  }
  const lines = readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// ── Query Neon directly ──
let _db;
function getDb() {
  if (_db) return _db;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL not set in .env.local");
    process.exit(1);
  }
  return import("@neondatabase/serverless").then(({ neon }) => {
    _db = neon(dbUrl);
    return _db;
  });
}

// ── Fetch all configs ──
async function fetchConfigs(compositionId) {
  const db = await getDb();
  if (compositionId) {
    const rows = await db`SELECT * FROM video_configs WHERE composition_id = ${compositionId}`;
    if (!rows.length) {
      console.error(`❌ No video config found for: ${compositionId}`);
      const all = await db`SELECT composition_id, title FROM video_configs ORDER BY created_at`;
      console.error("\nAvailable compositions:");
      for (const r of all) console.error(`  - ${r.composition_id} (${r.title})`);
      process.exit(1);
    }
    return rows;
  }
  return db`SELECT * FROM video_configs WHERE is_active = true ORDER BY created_at`;
}

async function fetchAllConfigs() {
  const db = await getDb();
  return db`SELECT * FROM video_configs ORDER BY created_at`;
}

// ── Build props from config ──
function buildProps(config) {
  return {
    title: config.intro_title || config.title,
    steps: config.steps,
    recordingFile: config.recording_file,
    introSec: Number(config.intro_sec),
    videoSec: Number(config.video_sec),
    endSec: Number(config.end_sec),
    titleCardDurationSec: Number(config.title_card_duration_sec),
    captionDurationSec: Number(config.caption_duration_sec),
    endTagline: config.end_tagline,
    endCta: config.end_cta,
  };
}

function outFileName(compositionId) {
  return compositionId.replace(/([A-Z])/g, "-$1").toLowerCase().slice(1);
}

// ── Commands ──

async function cmdList() {
  const rows = await fetchAllConfigs();
  console.log(`\n🎬 ${rows.length} video(s)\n`);
  for (const r of rows) {
    const active = r.is_active ? "✅" : "⬜";
    const dur = Number(r.intro_sec) + Number(r.video_sec) + (r.steps.length * Number(r.title_card_duration_sec)) + Number(r.end_sec);
    const mins = Math.floor(dur / 60);
    const secs = Math.round(dur % 60);
    console.log(`  ${active} ${r.composition_id}`);
    console.log(`     ${r.title} — ${r.steps.length} steps — ${mins}:${String(secs).padStart(2, "0")} — ${r.recording_file}`);
  }
  console.log();
}

async function cmdRender(compositionId) {
  const configs = await fetchConfigs(compositionId);
  console.log(`\n🎬 Rendering ${configs.length} video(s)\n`);

  mkdirSync(resolve(VIDEOS_DIR, "props"), { recursive: true });
  mkdirSync(resolve(VIDEOS_DIR, "out"), { recursive: true });

  let ok = 0, fail = 0;

  for (const config of configs) {
    const id = config.composition_id;
    const out = outFileName(id);

    // Check recording
    const recPath = resolve(VIDEOS_DIR, "public/recordings", config.recording_file);
    if (!existsSync(recPath)) {
      console.warn(`⚠️  Skipping ${id} — recording not found: ${config.recording_file}`);
      console.warn(`   Expected: ${recPath}\n`);
      fail++;
      continue;
    }

    // Write props
    const props = buildProps(config);
    const propsFile = resolve(VIDEOS_DIR, "props", `${id}.json`);
    writeFileSync(propsFile, JSON.stringify(props, null, 2));

    console.log(`▶ ${id}`);
    console.log(`  recording: ${config.recording_file}`);
    console.log(`  steps:     ${config.steps.length}`);
    console.log(`  output:    videos/out/${out}.mp4`);

    try {
      execSync(
        `npx remotion render src/index.ts ${id} out/${out}.mp4 --props props/${id}.json`,
        { stdio: "inherit", cwd: VIDEOS_DIR }
      );
      console.log(`  ✅ Done\n`);
      ok++;
    } catch {
      console.error(`  ❌ Failed\n`);
      fail++;
    }
  }

  console.log(`\n🏁 ${ok} rendered, ${fail} failed`);
  if (ok > 0) console.log(`📁 Output: ${resolve(VIDEOS_DIR, "out")}\n`);
}

async function cmdPreview(compositionId) {
  if (!compositionId) {
    console.error("❌ Specify a composition: node scripts/video.mjs preview RideFlow");
    process.exit(1);
  }

  // Validate it exists
  await fetchConfigs(compositionId);

  // Write props so Studio can use them
  const configs = await fetchConfigs(compositionId);
  const props = buildProps(configs[0]);
  mkdirSync(resolve(VIDEOS_DIR, "props"), { recursive: true });
  writeFileSync(
    resolve(VIDEOS_DIR, "props", `${compositionId}.json`),
    JSON.stringify(props, null, 2)
  );

  console.log(`\n🎬 Starting Remotion Studio → ${compositionId}`);
  console.log(`   Opening browser when ready...\n`);

  const studio = spawn("npx", ["remotion", "studio"], {
    cwd: VIDEOS_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  let opened = false;

  const tryOpen = (data) => {
    const text = data.toString();
    process.stdout.write(text);

    if (!opened) {
      // Remotion Studio prints the URL when ready
      const urlMatch = text.match(/https?:\/\/localhost:\d+/);
      if (urlMatch) {
        opened = true;
        const studioUrl = `${urlMatch[0]}/?composition=${compositionId}`;
        console.log(`\n🌐 Opening: ${studioUrl}\n`);
        try {
          execSync(`open "${studioUrl}"`, { stdio: "ignore" });
        } catch {
          console.log(`   Open manually: ${studioUrl}`);
        }
      }
    }
  };

  studio.stdout.on("data", tryOpen);
  studio.stderr.on("data", tryOpen);

  studio.on("close", (code) => {
    console.log(`\nStudio exited (code ${code})`);
  });

  // Keep alive
  process.on("SIGINT", () => {
    studio.kill();
    process.exit(0);
  });
}

// ── Main ──
async function main() {
  loadEnv();

  const [command, compositionId] = process.argv.slice(2);

  if (!command || command === "help") {
    console.log(`
Usage:
  node scripts/video.mjs render RideFlow     Render one video
  node scripts/video.mjs render              Render all active videos
  node scripts/video.mjs preview RideFlow    Open Remotion Studio to this composition
  node scripts/video.mjs list                Show all video configs

Shorthand:
  npm run video -- render RideFlow
  npm run video -- preview RideFlow
  npm run video -- list
`);
    process.exit(0);
  }

  switch (command) {
    case "list":
      await cmdList();
      break;
    case "render":
      await cmdRender(compositionId);
      break;
    case "preview":
      await cmdPreview(compositionId);
      break;
    default:
      console.error(`Unknown command: ${command}. Use render, preview, or list.`);
      process.exit(1);
  }
}

main();
