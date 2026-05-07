import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';

const source = JSON.parse(readFileSync(resolve(__dirname, '../public/performances.json'), 'utf8'));
const schema = JSON.parse(readFileSync(resolve(__dirname, '../scripts/performances.schema.json'), 'utf8'));
interface Entry {
  videoId: string;
  startTime: number;
  endTime?: number | null;
  videoDate: string;
  title: string;
}
const data: Entry[] = source.performances;

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

describe('performances.json schema validation', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('every entry passes the schema', () => {
    const valid = validate(source);
    if (!valid) {
      const summary = validate.errors!
        .slice(0, 10)
        .map(e => `  [${e.instancePath}] ${e.message}`)
        .join('\n');
      expect.fail(`Schema violations:\n${summary}`);
    }
  });

  it('every videoDate is a real calendar date', () => {
    const bad = data.filter(e => {
      const d = new Date(e.videoDate + 'T00:00:00');
      return isNaN(d.getTime());
    });
    expect(bad).toEqual([]);
  });

  it('endTime is greater than startTime when present', () => {
    const bad = data.filter(e => e.endTime != null && e.endTime <= e.startTime);
    expect(bad).toEqual([]);
  });

  it('no duplicate videoId + startTime pairs', () => {
    const seen = new Set<string>();
    const dupes: Entry[] = [];
    for (const e of data) {
      const key = `${e.videoId}:${e.startTime}`;
      if (seen.has(key)) dupes.push(e);
      else seen.add(key);
    }
    expect(dupes).toEqual([]);
  });
});
