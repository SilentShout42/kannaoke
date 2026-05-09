import { describe, it, expect } from 'vitest';
import { pickRandomSong } from './songPicker';
import type { SongEntry } from './songPicker';

const make = (overrides: Partial<SongEntry> = {}): SongEntry => ({
  videoId: 'abc123',
  startTime: 0,
  title: 'Test Song',
  artist: 'Test Artist',
  videoTitle: 'Karaoke Stream',
  videoDate: '2026-01-01',
  ...overrides,
});

describe('pickRandomSong', () => {
  it('excludes membersOnly entries', () => {
    const performances = [
      make({ membersOnly: true, title: 'Members' }),
      make({ membersOnly: false, title: 'Public' }),
    ];
    for (let i = 0; i < 20; i++) {
      expect(pickRandomSong(performances)?.title).toBe('Public');
    }
  });

  it('excludes entries with "cover" in videoTitle (case-insensitive)', () => {
    const performances = [
      make({ videoTitle: 'Cover Stream', title: 'A' }),
      make({ videoTitle: 'COVER NIGHT', title: 'B' }),
      make({ videoTitle: 'Official Cover', title: 'C' }),
      make({ videoTitle: 'Karaoke Stream', title: 'D' }),
    ];
    for (let i = 0; i < 30; i++) {
      expect(pickRandomSong(performances)?.title).toBe('D');
    }
  });

  it('falls back to full list if all entries are filtered out', () => {
    const performances = [make({ membersOnly: true, title: 'Only Entry' })];
    expect(pickRandomSong(performances)?.title).toBe('Only Entry');
  });

  it('returns null for empty array', () => {
    expect(pickRandomSong([])).toBeNull();
  });

  it('returns an entry from the valid pool', () => {
    const performances = [
      make({ title: 'A' }),
      make({ title: 'B' }),
      make({ title: 'C' }),
    ];
    const result = pickRandomSong(performances);
    expect(['A', 'B', 'C']).toContain(result?.title);
  });
});
