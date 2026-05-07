import { describe, it, expect } from 'vitest';
import { formatDate } from './formatDate';

describe('formatDate', () => {
  it('formats as Month D, YYYY for en-US', () => {
    expect(formatDate('2025-01-07', 'en-US')).toBe('Jan 7, 2025');
  });

  it('formats as D Month YYYY for en-GB', () => {
    expect(formatDate('2025-01-07', 'en-GB')).toBe('7 Jan 2025');
  });

  it('US and EU formats are different', () => {
    const us = formatDate('2025-01-07', 'en-US');
    const eu = formatDate('2025-01-07', 'en-GB');
    expect(us).not.toBe(eu);
  });

  it('does not shift the date due to timezone', () => {
    // Dates near midnight UTC could land on the wrong day if parsed without a time component
    expect(formatDate('2025-01-01', 'en-US')).toBe('Jan 1, 2025');
    expect(formatDate('2025-12-31', 'en-US')).toBe('Dec 31, 2025');
  });
});
