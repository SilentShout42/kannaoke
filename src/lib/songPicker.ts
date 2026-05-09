export interface SongEntry {
  videoId: string;
  startTime: number;
  title: string;
  artist: string;
  videoTitle: string;
  videoDate: string;
  membersOnly?: boolean;
  endTime?: number | null;
}

export function pickRandomSong(performances: SongEntry[]): SongEntry | null {
  const pool = performances.filter(p => !p.membersOnly && !/cover/i.test(p.videoTitle));
  const source = pool.length > 0 ? pool : performances;
  if (source.length === 0) return null;
  return source[Math.floor(Math.random() * source.length)];
}
