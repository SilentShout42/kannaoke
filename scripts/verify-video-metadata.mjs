/**
 * Verify videoTitle and videoDate in performances.json against the YouTube Data API.
 *
 * Usage:
 *   YOUTUBE_API_KEY=<key> node scripts/verify-video-metadata.mjs
 *   node scripts/verify-video-metadata.mjs --key=<key>
 *   node scripts/verify-video-metadata.mjs --key=<key> --fix   # write corrections back
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, 'public', 'performances.json');

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const keyArg = args.find(a => a.startsWith('--key='))?.split('=')[1];
const apiKey = keyArg ?? process.env.YOUTUBE_API_KEY;

if (!apiKey) {
  console.error(
    'Error: YouTube API key required.\n' +
    '  Set the YOUTUBE_API_KEY environment variable, or pass --key=<key>',
  );
  process.exit(1);
}

async function fetchVideoBatch(ids) {
  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,liveStreamingDetails&id=${ids.join(',')}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${body}`);
  }
  return (await res.json()).items ?? [];
}

function youtubeDate(item) {
  // Prefer the actual stream start time for live broadcasts.
  const live = item.liveStreamingDetails?.actualStartTime;
  return (live ?? item.snippet.publishedAt).slice(0, 10);
}

async function main() {
  const raw = await readFile(SOURCE_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const entries = parsed.performances;

  const uniqueIds = [...new Set(entries.map(e => e.videoId))];
  console.log(`Checking ${uniqueIds.length} unique video IDs across ${entries.length} entries…`);

  // Fetch metadata in batches of 50 (API limit).
  const videoMap = {};
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const items = await fetchVideoBatch(uniqueIds.slice(i, i + 50));
    for (const item of items) {
      videoMap[item.id] = { title: item.snippet.title, date: youtubeDate(item) };
    }
  }

  const notFound = uniqueIds.filter(id => !videoMap[id]);
  if (notFound.length) {
    console.warn(`\nWarning: ${notFound.length} video(s) not found (private or deleted):`);
    for (const id of notFound) console.warn(`  https://youtu.be/${id}`);
  }

  // Group mismatches by video ID so each video is reported once.
  const byVideo = {};
  for (const entry of entries) {
    const info = videoMap[entry.videoId];
    if (!info) continue;
    const titleMismatch = entry.videoTitle !== info.title;
    const dateMismatch = entry.videoDate !== info.date;
    if (!titleMismatch && !dateMismatch) continue;
    if (!byVideo[entry.videoId]) {
      byVideo[entry.videoId] = { info, titleMismatch, dateMismatch, storedTitle: entry.videoTitle, storedDate: entry.videoDate };
    }
  }

  const mismatchedVideoIds = Object.keys(byVideo);
  if (mismatchedVideoIds.length === 0) {
    console.log('\nAll videoTitles and videoDates match. ✓');
    return;
  }

  console.log(`\n${mismatchedVideoIds.length} video(s) with mismatched metadata:\n`);
  for (const id of mismatchedVideoIds) {
    const { info, titleMismatch, dateMismatch, storedTitle, storedDate } = byVideo[id];
    const affectedCount = entries.filter(e => e.videoId === id).length;
    console.log(`https://youtu.be/${id}  (${affectedCount} entr${affectedCount === 1 ? 'y' : 'ies'})`);
    if (titleMismatch) {
      console.log(`  videoTitle stored : ${storedTitle}`);
      console.log(`  videoTitle actual : ${info.title}`);
    }
    if (dateMismatch) {
      console.log(`  videoDate  stored : ${storedDate}`);
      console.log(`  videoDate  actual : ${info.date}`);
    }
    console.log();
  }

  if (!fix) {
    console.log('Run with --fix to apply corrections to performances.json.');
    return;
  }

  // Apply corrections to every affected entry.
  let updatedEntries = 0;
  for (const entry of entries) {
    const diff = byVideo[entry.videoId];
    if (!diff) continue;
    if (diff.titleMismatch) entry.videoTitle = diff.info.title;
    if (diff.dateMismatch) entry.videoDate = diff.info.date;
    updatedEntries++;
  }

  await writeFile(SOURCE_PATH, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  console.log(`Updated ${updatedEntries} entr${updatedEntries === 1 ? 'y' : 'ies'} in performances.json.`);
  console.log('Run `npm run prepare:data` to rebuild the derived files.');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
