type DateParts = { year: number; month: number; day: number; hour: number; minute: number };

function getPartsInTz(date: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value, 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

// Find the UTC Unix timestamp (seconds) corresponding to a given wall-clock
// hour:minute on a specific calendar date in a timezone. The naive UTC guess
// (treating local hour as UTC hour) can land on a different calendar day in
// the target timezone (e.g. UTC+5:30 or UTC+14), so we include the day gap
// in the correction. Converges in ≤3 steps across all offsets including DST.
function wallClockToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): number {
  let guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const targetDayMs = Date.UTC(year, month - 1, day);

  for (let i = 0; i < 4; i++) {
    const parts = getPartsInTz(new Date(guessMs), timezone);
    const localDayMs = Date.UTC(parts.year, parts.month - 1, parts.day);
    const diffMin =
      (targetDayMs - localDayMs) / 60_000 +
      (hour - parts.hour) * 60 +
      (minute - parts.minute);
    if (diffMin === 0) break;
    guessMs += diffMin * 60_000;
  }

  return Math.floor(guessMs / 1000);
}

export function computeNextFireAt(
  hour: number,
  minute: number,
  timezone: string,
  now: Date = new Date(),
): number {
  const nowSec = Math.floor(now.getTime() / 1000);
  const p = getPartsInTz(now, timezone);

  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    let { year, month, day } = p;
    if (dayOffset === 1) {
      // Advance one calendar day in the target timezone.
      const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
      const np = getPartsInTz(nextDay, timezone);
      ({ year, month, day } = np);
    }
    const candidateSec = wallClockToUtc(year, month, day, hour, minute, timezone);
    if (candidateSec > nowSec) return candidateSec;
  }

  // Fallback: always returns tomorrow, reachable only when dayOffset=1 fires at exact nowSec.
  const p1 = getPartsInTz(new Date((nowSec + 86400) * 1000), timezone);
  return wallClockToUtc(p1.year, p1.month, p1.day, hour, minute, timezone);
}
