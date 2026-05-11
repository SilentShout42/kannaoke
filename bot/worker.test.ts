import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './worker';

// Mock shared modules
vi.mock('../src/lib/songPicker', () => ({
  pickRandomSong: vi.fn(),
}));

vi.mock('../src/lib/schedule', () => ({
  computeNextFireAt: vi.fn(() => 1700000000),
}));

vi.mock('../src/lib/discord', () => ({
  buildSongEmbed: vi.fn(() => ({
    title: 'Test Song',
     url: 'https://test.com/?v=test&t=0',
     description: 'Test Artist · 2024-01-01',
     color: 0xc8902a,
     thumbnail: { url: 'https://i.ytimg.com/vi/test/mqdefault.jpg' },
     footer: { text: 'Kannaoke' },
     timestamp: new Date().toISOString(),
    })),
   postToWebhook: vi.fn(),
}));

const { pickRandomSong } = await import('../src/lib/songPicker');
const { postToWebhook } = await import('../src/lib/discord');

function makeDbMock(stmtMocks: Record<string, any>) {
  return {
    prepare: vi.fn().mockImplementation((sql: string) => {
      const key = sql.split('\n').join(' ').trim();
      const mock = stmtMocks[key] ?? { all: vi.fn().mockResolvedValue({ results: [] }), run: vi.fn().mockResolvedValue({ changes: 1 }) };
      return {
        bind: vi.fn().mockReturnThis(),
         ...mock,
        };
      }),
     };
}

const mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;


describe('bot worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
     });

  describe('fetch handler', () => {
    it('returns 404 for non-interaction paths', async () => {
      const req = new Request('https://bot.test/other', { method: 'POST' });
      const resp = await worker.fetch(req, {} as any, mockCtx);
      expect(resp.status).toBe(404);
       });

    it('returns 405 for non-POST methods', async () => {
      const req = new Request('https://bot.test/api/interactions', { method: 'GET' });
      const resp = await worker.fetch(req, {} as any, mockCtx);
      expect(resp.status).toBe(405);
       });

    it('returns 401 for missing signature headers', async () => {
      const req = new Request('https://bot.test/api/interactions', {
        method: 'POST',
         body: '{}',
        });
      const resp = await worker.fetch(req, {} as any, mockCtx);
      expect(resp.status).toBe(401);
       });
   });

  describe('scheduled handler', () => {
    it('does nothing when no schedules are due', async () => {
      const db = makeDbMock({});
      const env = { DB: db, BASE_URL: 'https://test.com' } as any;

      await worker.scheduled({} as any, env, mockCtx);

      expect(db.prepare).toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
       });

    it('fires due schedules', async () => {
      const song = {
        videoId: 'abc',
         startTime: 0,
         title: 'Test Song',
         artist: 'Test Artist',
         videoTitle: 'Test Stream',
         videoDate: '2024-01-01',
        };
       (pickRandomSong as any).mockReturnValue(song);

      const scheduleQuery = 'SELECT * FROM schedules WHERE active = 1 AND next_fire_at <= ?';
      const updateQuery = 'UPDATE schedules SET next_fire_at = ?, updated_at = unixepoch() WHERE id = ?';

      const db = makeDbMock({
         [scheduleQuery]: {
           all: vi.fn().mockResolvedValue({ results: [{ id: 1, guild_id: '123', channel_id: '456', webhook_url: 'https://test.com/webhook', schedule_hour: 9, schedule_minute: 0, timezone: 'UTC' }] }),
            },
          [updateQuery]: { run: vi.fn().mockResolvedValue({ changes: 1 }) },
          });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
         json: () => Promise.resolve([song]),
        });

      const env = { DB: db, BASE_URL: 'https://test.com' } as any;
      await worker.scheduled({} as any, env, mockCtx);

      expect(pickRandomSong).toHaveBeenCalled();
      expect(postToWebhook).toHaveBeenCalled();
       });
   });
});
