import { describe, it, expect } from 'vitest';
import { computeNextFireAt } from './schedule';

const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe('computeNextFireAt', () => {
  it('returns today when schedule is still in the future', () => {
    // 08:00 UTC = 01:00 AM PDT (UTC-7). Schedule 09:00 LA = 16:00 UTC.
    const now = new Date('2026-05-08T08:00:00Z');
    const result = computeNextFireAt(9, 0, 'America/Los_Angeles', now);
    expect(result).toBe(sec('2026-05-08T16:00:00Z'));
  });

  it('returns tomorrow when schedule has already passed today', () => {
    // 18:00 UTC = 11:00 AM PDT. Schedule 09:00 LA already passed.
    const now = new Date('2026-05-08T18:00:00Z');
    const result = computeNextFireAt(9, 0, 'America/Los_Angeles', now);
    expect(result).toBe(sec('2026-05-09T16:00:00Z'));
  });

  it('handles UTC timezone', () => {
    const now = new Date('2026-05-08T10:00:00Z');
    const result = computeNextFireAt(14, 30, 'UTC', now);
    expect(result).toBe(sec('2026-05-08T14:30:00Z'));
  });

  it('handles fractional UTC offset (Asia/Kolkata UTC+5:30)', () => {
    // 10:00 UTC = 15:30 IST. Schedule 20:00 IST = 14:30 UTC.
    const now = new Date('2026-05-08T10:00:00Z');
    const result = computeNextFireAt(20, 0, 'Asia/Kolkata', now);
    expect(result).toBe(sec('2026-05-08T14:30:00Z'));
  });

  it('handles DST spring-forward (America/New_York, clocks go 2→3 AM)', () => {
    // Spring forward 2026-03-08T02:00 ET → 03:00 EDT.
    // Before the transition: 2026-03-08T06:30:00Z = 01:30 AM EST (UTC-5).
    // Schedule 09:00 ET = 14:00 UTC (EDT, UTC-4) on that day.
    const now = new Date('2026-03-08T06:30:00Z');
    const result = computeNextFireAt(9, 0, 'America/New_York', now);
    expect(result).toBe(sec('2026-03-08T13:00:00Z'));
  });

  it('returns a timestamp strictly greater than now', () => {
    const now = new Date('2026-05-08T23:55:00Z');
    const result = computeNextFireAt(23, 55, 'UTC', now);
    expect(result).toBeGreaterThan(Math.floor(now.getTime() / 1000));
  });
});
