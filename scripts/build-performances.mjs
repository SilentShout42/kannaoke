import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Fuse from 'fuse.js';

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, 'public', 'performances.json');
const MINIFIED_PATH = path.join(ROOT, 'public', 'performances.min.json');
const INDEX_PATH = path.join(ROOT, 'public', 'performances.fuse-index.json');

const FUSE_KEYS = ['title', 'artist', 'videoTitle'];

function fail(message) {
  throw new Error(message);
}

function assertString(obj, key, idx) {
  if (typeof obj[key] !== 'string' || obj[key].trim() === '') {
    fail(`Entry ${idx}: ${key} must be a non-empty string`);
  }
}

function assertInteger(obj, key, idx) {
  if (!Number.isInteger(obj[key]) || obj[key] < 0) {
    fail(`Entry ${idx}: ${key} must be a non-negative integer`);
  }
}

function normalizeEntry(entry, idx) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    fail(`Entry ${idx}: must be an object`);
  }

  assertString(entry, 'title', idx);
  assertString(entry, 'videoId', idx);
  assertString(entry, 'videoTitle', idx);
  assertString(entry, 'videoDate', idx);
  assertInteger(entry, 'startTime', idx);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.videoDate)) {
    fail(`Entry ${idx}: videoDate must be YYYY-MM-DD`);
  }

  const artist = typeof entry.artist === 'string' && entry.artist.trim()
    ? entry.artist.trim()
    : 'Unknown Artist';

  const normalized = {
    title: entry.title.trim(),
    artist,
    videoId: entry.videoId.trim(),
    videoTitle: entry.videoTitle.trim(),
    videoDate: entry.videoDate,
    startTime: entry.startTime,
    membersOnly: entry.membersOnly === true,
  };

  if ('membersOnly' in entry && typeof entry.membersOnly !== 'boolean') {
    fail(`Entry ${idx}: membersOnly must be a boolean when present`);
  }

  if ('endTime' in entry && entry.endTime !== null) {
    if (!Number.isInteger(entry.endTime) || entry.endTime < normalized.startTime) {
      fail(`Entry ${idx}: endTime must be null or an integer >= startTime`);
    }
    normalized.endTime = entry.endTime;
  }

  return normalized;
}

function dedupeEntries(entries) {
  const seen = new Set();
  const out = [];
  let removed = 0;

  for (const entry of entries) {
    const key = JSON.stringify([
      entry.videoId,
      entry.startTime,
      entry.title,
      entry.artist,
      entry.videoTitle,
      entry.videoDate,
      entry.membersOnly,
      entry.endTime ?? null,
    ]);
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    out.push(entry);
  }

  return { out, removed };
}

function sortEntries(entries) {
  entries.sort((a, b) =>
    b.videoDate.localeCompare(a.videoDate) ||
    a.videoId.localeCompare(b.videoId) ||
    a.startTime - b.startTime ||
    a.title.localeCompare(b.title),
  );
}

async function main() {
  const rawText = await readFile(SOURCE_PATH, 'utf8');
  const parsed = JSON.parse(rawText);
  const entries = Array.isArray(parsed) ? parsed : parsed?.performances;
  if (!Array.isArray(entries)) {
    fail('performances.json must contain a "performances" array');
  }

  const normalized = entries.map((entry, idx) => normalizeEntry(entry, idx));
  const { out: deduped, removed } = dedupeEntries(normalized);
  sortEntries(deduped);

  const index = Fuse.createIndex(FUSE_KEYS, deduped);

  await Promise.all([
    writeFile(MINIFIED_PATH, JSON.stringify(deduped), 'utf8'),
    writeFile(INDEX_PATH, JSON.stringify(index.toJSON()), 'utf8'),
  ]);

  console.log(
    `Built performance artifacts: ${deduped.length} entries (${removed} duplicates removed).`,
  );
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
