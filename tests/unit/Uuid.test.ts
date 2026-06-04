import { generateUuid } from '@lfs/shared';
import { describe, expect, it } from 'vitest';

describe('Uuid', () => {
  it('returns a non-empty string', () => {
    const id = generateUuid();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('produces unique values over 10,000 generations', () => {
    const set = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      set.add(generateUuid());
    }
    expect(set.size).toBe(10_000);
  });

  it('matches the v4 UUID format', () => {
    const id = generateUuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
